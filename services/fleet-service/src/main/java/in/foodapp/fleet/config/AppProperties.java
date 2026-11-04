package in.foodapp.fleet.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String jwtPublicKeyPem,
        String internalFeedKey,
        int maxActiveDeliveries,
        Feed feed) {

    public record Feed(String orderUrl, String orderKey, int batchSize, int maxAttempts) {
    }
}