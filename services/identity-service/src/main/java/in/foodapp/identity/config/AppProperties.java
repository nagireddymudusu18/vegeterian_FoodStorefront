package in.foodapp.identity.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String internalFeedKey,
        String smsProvider,
        Jwt jwt,
        Pii pii,
        Otp otp,
        Refresh refresh,
        String emailProvider,
        String appBaseUrl) {

    public record Jwt(String issuer, long accessTtlSeconds, String privateKeyPem, String publicKeyPem) {
    }

    public record Pii(String encKey, String hmacKey) {
    }

    public record Otp(long ttlSeconds, int maxAttempts, int phoneMaxRequests, long phoneWindowSeconds,
                      int ipMaxRequests, long ipWindowSeconds) {
    }

    public record Refresh(long ttlDays) {
    }
}
