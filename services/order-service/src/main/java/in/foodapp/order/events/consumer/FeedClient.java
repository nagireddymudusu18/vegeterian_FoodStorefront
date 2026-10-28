package in.foodapp.order.events.consumer;

import in.foodapp.order.events.consumer.FeedDtos.FeedPage;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** Thin HTTP client for a producer's event feed. Throws RestClientException when the producer is unreachable. */
@Component
public class FeedClient {

    private final RestClient.Builder builder;

    public FeedClient(RestClient.Builder builder) {
        this.builder = builder;
    }

    public FeedPage fetch(String baseUrl, String key, long after, int limit) {
        RestClient client = builder.clone().baseUrl(stripTrailingSlash(baseUrl)).build();
        return client.get()
                .uri("/internal/events?after={after}&limit={limit}", after, limit)
                .header("X-Internal-Key", key)
                .retrieve()
                .body(FeedPage.class);
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
