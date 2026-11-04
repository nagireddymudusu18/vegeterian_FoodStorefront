package in.foodapp.notification.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String jwtPublicKeyPem,
        String contactEventKey,
        String smsProvider,
        String emailProvider,
        Messaging messaging,
        Feed feed) {

    public record Messaging(int maxEventAgeMinutes, int broadcastTtlMinutes, int dispatchMaxAttempts) {
    }

    public record Feed(int batchSize, int maxAttempts,
                       String identityUrl, String identityKey,
                       String catalogUrl, String catalogKey,
                       String orderUrl, String orderKey,
                       String paymentUrl, String paymentKey,
                       String fleetUrl, String fleetKey) {
    }
}
