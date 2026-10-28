package in.foodapp.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.foodapp.identity.infra.sms.SmsSender;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@SpringBootTest
@ActiveProfiles("local")
@AutoConfigureMockMvc
class IdentityFlowIT {

    private static final String FEED_KEY = "it-feed-key";

    static final TestDatabase.Conn DB = TestDatabase.start("identity", false);

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DB::url);
        registry.add("spring.datasource.username", DB::user);
        registry.add("spring.datasource.password", DB::password);
        registry.add("app.internal-feed-key", () -> FEED_KEY);
    }

    /** Captures OTPs instead of sending them. */
    static class CapturingSmsSender implements SmsSender {
        final Map<String, String> lastCodeByPhone = new ConcurrentHashMap<>();

        @Override
        public void sendOtp(String e164Phone, String code) {
            lastCodeByPhone.put(e164Phone, code);
        }
    }

    @TestConfiguration
    static class TestBeans {
        @Bean
        @Primary
        CapturingSmsSender capturingSmsSender() {
            return new CapturingSmsSender();
        }
    }

    @Autowired
    MockMvc mvc;
    @Autowired
    ObjectMapper mapper;
    @Autowired
    CapturingSmsSender sms;

    // ---------- helpers ----------

    private ResultActions postJson(String path, Object body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body)));
    }

    private void requestOtp(String phone) throws Exception {
        postJson("/auth/otp/request", Map.of("phone", phone)).andExpect(status().isAccepted());
    }

    private Map<String, Object> consent(boolean granted) {
        return Map.of("purpose", "TERMS_AND_PRIVACY", "version", "v1", "granted", granted);
    }

    private ResultActions verify(String phone, String code, Map<String, Object> consent) throws Exception {
        return postJson("/auth/otp/verify", Map.of("phone", phone, "code", code, "consent", consent));
    }

    private JsonNode login(String nationalPhone) throws Exception {
        requestOtp(nationalPhone);
        String code = sms.lastCodeByPhone.get("+91" + nationalPhone);
        assertNotNull(code);
        String body = verify(nationalPhone, code, consent(true)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(body);
    }

    private String wrongCode(String real) {
        return "000000".equals(real) ? "111111" : "000000";
    }

    private JsonNode feed(String key, long after, int limit) throws Exception {
        var req = get("/internal/events").param("after", String.valueOf(after)).param("limit", String.valueOf(limit));
        if (key != null) {
            req = req.header("X-Internal-Key", key);
        }
        return mapper.readTree(mvc.perform(req).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString());
    }

    // ---------- tests ----------

    @Test
    void fullFlowOtpVerifyMeRefreshDelete() throws Exception {
        String phone = "9876543210";
        requestOtp(phone);
        String code = sms.lastCodeByPhone.get("+919876543210");
        assertNotNull(code);
        assertEquals(6, code.length());

        // wrong code is rejected but counts as an attempt
        verify(phone, wrongCode(code), consent(true)).andExpect(status().isUnauthorized());

        // new user without consent granted is rejected, OTP remains usable
        verify(phone, code, consent(false)).andExpect(status().isBadRequest());

        String body = verify(phone, code, consent(true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.expiresIn").value(900))
                .andReturn().getResponse().getContentAsString();
        JsonNode tokens = mapper.readTree(body);
        String access = tokens.get("accessToken").asText();
        String refresh1 = tokens.get("refreshToken").asText();

        // OTP is single-use
        verify(phone, code, consent(true)).andExpect(status().isUnauthorized());

        // /me requires a token and returns a masked phone
        mvc.perform(get("/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/me").header("Authorization", "Bearer " + access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").value("+91XXXXXX3210"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.roles[0]").value("CUSTOMER"));

        // consent can be recorded
        mvc.perform(post("/me/consents").header("Authorization", "Bearer " + access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(consent(true))))
                .andExpect(status().isNoContent());

        // refresh rotates; reuse of the old token revokes the whole family
        String refreshBody = postJson("/auth/refresh", Map.of("refreshToken", refresh1))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String refresh2 = mapper.readTree(refreshBody).get("refreshToken").asText();
        assertNotEquals(refresh1, refresh2);

        postJson("/auth/refresh", Map.of("refreshToken", refresh1)).andExpect(status().isUnauthorized());
        postJson("/auth/refresh", Map.of("refreshToken", refresh2)).andExpect(status().isUnauthorized());

        // fresh login for same phone reuses the same user
        requestOtp(phone);
        String code2 = sms.lastCodeByPhone.get("+919876543210");
        JsonNode second = mapper.readTree(verify(phone, code2, consent(true)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        String access2 = second.get("accessToken").asText();
        String refresh3 = second.get("refreshToken").asText();
        String id1 = mapper.readTree(mvc.perform(get("/me").header("Authorization", "Bearer " + access))
                .andReturn().getResponse().getContentAsString()).get("id").asText();
        String id2 = mapper.readTree(mvc.perform(get("/me").header("Authorization", "Bearer " + access2))
                .andReturn().getResponse().getContentAsString()).get("id").asText();
        assertEquals(id1, id2);

        // erasure
        mvc.perform(delete("/me").header("Authorization", "Bearer " + access2)).andExpect(status().isNoContent());
        mvc.perform(get("/me").header("Authorization", "Bearer " + access2)).andExpect(status().isNotFound());
        postJson("/auth/refresh", Map.of("refreshToken", refresh3)).andExpect(status().isUnauthorized());

        // outbox received UserRegistered and UserDeleted for this user
        JsonNode all = feed(FEED_KEY, 0, 500);
        boolean registered = false;
        boolean deleted = false;
        for (JsonNode e : all.get("events")) {
            if (id1.equals(e.get("aggregateId").asText())) {
                registered |= "UserRegistered".equals(e.get("type").asText());
                deleted |= "UserDeleted".equals(e.get("type").asText());
                assertEquals(id1, e.get("payload").get("userId").asText());
            }
        }
        assertTrue(registered);
        assertTrue(deleted);

        // the same phone can register again as a brand new user after erasure
        requestOtp(phone);
        String code3 = sms.lastCodeByPhone.get("+919876543210");
        JsonNode third = mapper.readTree(verify(phone, code3, consent(true)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        String id3 = mapper.readTree(mvc.perform(get("/me").header("Authorization", "Bearer "
                        + third.get("accessToken").asText()))
                .andReturn().getResponse().getContentAsString()).get("id").asText();
        assertNotEquals(id1, id3);
    }

    @Test
    void newUserMustGrantConsent() throws Exception {
        String phone = "9876500001";
        requestOtp(phone);
        String code = sms.lastCodeByPhone.get("+91" + phone);
        postJson("/auth/otp/verify", Map.of("phone", phone, "code", code)).andExpect(status().isBadRequest());
        verify(phone, code, consent(false)).andExpect(status().isBadRequest());
        verify(phone, code, consent(true)).andExpect(status().isOk());
    }

    @Test
    void otpLocksAfterFiveWrongAttempts() throws Exception {
        String phone = "9876500002";
        requestOtp(phone);
        String code = sms.lastCodeByPhone.get("+91" + phone);
        for (int i = 0; i < 5; i++) {
            verify(phone, wrongCode(code), consent(true)).andExpect(status().isUnauthorized());
        }
        verify(phone, code, consent(true)).andExpect(status().isUnauthorized());
    }

    @Test
    void otpRequestIsRateLimitedPerPhone() throws Exception {
        String phone = "9876500003";
        for (int i = 0; i < 3; i++) {
            requestOtp(phone);
        }
        postJson("/auth/otp/request", Map.of("phone", phone)).andExpect(status().isTooManyRequests());
    }

    @Test
    void invalidPhoneIsRejectedWithProblemJson() throws Exception {
        postJson("/auth/otp/request", Map.of("phone", "12345"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.title").value("Bad Request"));
    }

    @Test
    void logoutRevokesRefreshToken() throws Exception {
        JsonNode tokens = login("9876500004");
        String refresh = tokens.get("refreshToken").asText();
        postJson("/auth/logout", Map.of("refreshToken", refresh)).andExpect(status().isNoContent());
        postJson("/auth/refresh", Map.of("refreshToken", refresh)).andExpect(status().isUnauthorized());
    }

    @Test
    void jwksIsPublic() throws Exception {
        mvc.perform(get("/.well-known/jwks.json"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.keys[0].kty").value("RSA"))
                .andExpect(jsonPath("$.keys[0].alg").value("RS256"));
    }

    @Test
    void feedPaginatesInOrderWithCursor() throws Exception {
        login("9876500011");
        login("9876500012");
        login("9876500013");

        JsonNode page1 = feed(FEED_KEY, 0, 2);
        JsonNode events1 = page1.get("events");
        assertEquals(2, events1.size());
        assertTrue(events1.get(0).get("id").asLong() < events1.get(1).get("id").asLong());
        long cursor = page1.get("nextCursor").asLong();
        assertEquals(events1.get(1).get("id").asLong(), cursor);
        assertNotNull(events1.get(0).get("occurredAt"));
        assertTrue(Set.of("UserRegistered", "UserDeleted").contains(events1.get(0).get("type").asText()));

        JsonNode page2 = feed(FEED_KEY, cursor, 500);
        assertFalse(page2.get("events").isEmpty());
        for (JsonNode e : page2.get("events")) {
            assertTrue(e.get("id").asLong() > cursor);
        }

        JsonNode empty = feed(FEED_KEY, Long.MAX_VALUE, 10);
        assertEquals(0, empty.get("events").size());
        assertEquals(Long.MAX_VALUE, empty.get("nextCursor").asLong());
    }

    @Test
    void feedRejectsMissingOrWrongKey() throws Exception {
        mvc.perform(get("/internal/events")).andExpect(status().isUnauthorized());
        mvc.perform(get("/internal/events").header("X-Internal-Key", "wrong"))
                .andExpect(status().isUnauthorized());
    }
}
