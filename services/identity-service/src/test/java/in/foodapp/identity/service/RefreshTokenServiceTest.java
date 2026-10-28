package in.foodapp.identity.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.foodapp.identity.api.ApiException;
import in.foodapp.identity.config.AppProperties;
import in.foodapp.identity.persistence.RefreshToken;
import in.foodapp.identity.persistence.RefreshTokenRepository;
import in.foodapp.identity.persistence.User;
import in.foodapp.identity.persistence.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class RefreshTokenServiceTest {

    private static final Instant NOW = Instant.parse("2026-01-01T00:00:00Z");

    private RefreshTokenRepository tokens;
    private UserRepository users;
    private RefreshTokenService service;
    private final UUID userId = UUID.randomUUID();
    private final UUID familyId = UUID.randomUUID();
    private User user;

    @BeforeEach
    void setUp() {
        tokens = mock(RefreshTokenRepository.class);
        users = mock(UserRepository.class);
        AppProperties props = new AppProperties("key", "logging",
                new AppProperties.Jwt("identity-service", 900, "", ""),
                new AppProperties.Pii("", ""),
                new AppProperties.Otp(300, 5, 3, 600, 20, 600),
                new AppProperties.Refresh(30), "logging", "http://localhost:8080");
        service = new RefreshTokenService(tokens, users, props, Clock.fixed(NOW, ZoneOffset.UTC));
        user = new User(userId, new byte[]{1}, "hash", new String[]{"CUSTOMER"}, NOW);
    }

    private RefreshToken stored(String raw, boolean revoked, Instant expiresAt) {
        RefreshToken t = new RefreshToken(UUID.randomUUID(), userId, RefreshTokenService.hash(raw), familyId,
                expiresAt, NOW.minusSeconds(60));
        t.setRevoked(revoked);
        when(tokens.findByTokenHashForUpdate(RefreshTokenService.hash(raw))).thenReturn(Optional.of(t));
        return t;
    }

    @Test
    void rotationIssuesNewTokenInSameFamilyAndRevokesOld() {
        RefreshToken old = stored("raw-1", false, NOW.plusSeconds(3600));
        when(users.findById(userId)).thenReturn(Optional.of(user));

        RefreshTokenService.Issued issued = service.rotate("raw-1");

        assertNotNull(issued.rawToken());
        assertNotEquals("raw-1", issued.rawToken());
        assertEquals(userId, issued.user().getId());
        assertTrue(old.isRevoked());
        assertNotNull(old.getReplacedBy());

        ArgumentCaptor<RefreshToken> captor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(tokens, times(2)).save(captor.capture());
        List<RefreshToken> saved = captor.getAllValues();
        RefreshToken fresh = saved.get(0);
        assertEquals(familyId, fresh.getFamilyId());
        assertEquals(RefreshTokenService.hash(issued.rawToken()), fresh.getTokenHash());
        assertFalse(fresh.isRevoked());
        assertEquals(fresh.getId(), old.getReplacedBy());
        verify(tokens, never()).revokeFamily(any());
    }

    @Test
    void reuseOfRevokedTokenRevokesWholeFamily() {
        stored("raw-1", true, NOW.plusSeconds(3600));

        assertThrows(ApiException.class, () -> service.rotate("raw-1"));

        verify(tokens).revokeFamily(familyId);
        verify(tokens, never()).save(any());
    }

    @Test
    void unknownTokenIsRejected() {
        when(tokens.findByTokenHashForUpdate(any())).thenReturn(Optional.empty());
        assertThrows(ApiException.class, () -> service.rotate("nope"));
        verify(tokens, never()).save(any());
    }

    @Test
    void blankTokenIsRejected() {
        assertThrows(ApiException.class, () -> service.rotate(" "));
        assertThrows(ApiException.class, () -> service.rotate(null));
    }

    @Test
    void expiredTokenIsRejected() {
        stored("raw-1", false, NOW.minusSeconds(1));
        assertThrows(ApiException.class, () -> service.rotate("raw-1"));
        verify(tokens, never()).save(any());
    }

    @Test
    void deletedUserCannotRefreshAndFamilyIsRevoked() {
        stored("raw-1", false, NOW.plusSeconds(3600));
        user.markDeleted(NOW);
        when(users.findById(userId)).thenReturn(Optional.of(user));

        assertThrows(ApiException.class, () -> service.rotate("raw-1"));

        verify(tokens).revokeFamily(familyId);
        verify(tokens, never()).save(any());
    }

    @Test
    void logoutRevokesFamilyOfPresentedToken() {
        stored("raw-1", false, NOW.plusSeconds(3600));
        service.revokeFamilyOf("raw-1");
        verify(tokens).revokeFamily(familyId);
    }

    @Test
    void logoutWithUnknownTokenIsIdempotent() {
        when(tokens.findByTokenHashForUpdate(any())).thenReturn(Optional.empty());
        service.revokeFamilyOf("nope");
        verify(tokens, never()).revokeFamily(any());
    }
}
