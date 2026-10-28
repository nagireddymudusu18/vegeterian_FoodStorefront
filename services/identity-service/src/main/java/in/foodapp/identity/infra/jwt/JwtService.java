package in.foodapp.identity.infra.jwt;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import in.foodapp.identity.config.AppProperties;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class JwtService {

    private final JwtKeys keys;
    private final AppProperties props;
    private final Clock clock;

    public JwtService(JwtKeys keys, AppProperties props, Clock clock) {
        this.keys = keys;
        this.props = props;
        this.clock = clock;
    }

    public long accessTtlSeconds() {
        return props.jwt().accessTtlSeconds();
    }

    public String issueAccessToken(UUID userId, List<String> roles) {
        Instant now = clock.instant();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(props.jwt().issuer())
                .subject(userId.toString())
                .claim("roles", roles)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(accessTtlSeconds())))
                .build();
        JWSHeader header = new JWSHeader.Builder(JWSAlgorithm.RS256)
                .type(JOSEObjectType.JWT)
                .keyID(keys.keyId())
                .build();
        try {
            SignedJWT jwt = new SignedJWT(header, claims);
            jwt.sign(new RSASSASigner(keys.privateKey()));
            return jwt.serialize();
        } catch (JOSEException e) {
            throw new IllegalStateException("Failed to sign access token", e);
        }
    }

    public Map<String, Object> jwks() {
        RSAKey key = new RSAKey.Builder(keys.publicKey())
                .keyUse(KeyUse.SIGNATURE)
                .algorithm(JWSAlgorithm.RS256)
                .keyID(keys.keyId())
                .build();
        return new com.nimbusds.jose.jwk.JWKSet(key).toJSONObject();
    }
}
