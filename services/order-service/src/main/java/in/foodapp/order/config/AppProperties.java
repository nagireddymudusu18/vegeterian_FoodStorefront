package in.foodapp.order.config;

import java.math.BigDecimal;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String jwtPublicKeyPem,
        String internalFeedKey,
        BigDecimal gstPercent,
        long deliveryFeePaise,
        Feed feed) {

    public record Feed(
            String catalogUrl,
            String catalogKey,
            String paymentUrl,
            String paymentKey,
            String fleetUrl,
            String fleetKey,
            int batchSize) {
    }
}
