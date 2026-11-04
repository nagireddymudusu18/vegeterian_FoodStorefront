package in.foodapp.order.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.foodapp.order.events.consumer.DeadLetterService;
import in.foodapp.order.persistence.FeedFailureStore.DeadLetter;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Feed events other services sent that this service could not apply. ADMIN only (see SecurityConfig). */
@RestController
@RequestMapping("/admin/dead-letters")
public class DeadLetterController {

    public record DeadLetterView(long id, String source, long eventId, String eventType, UUID aggregateId,
                                 JsonNode payload, String error, int attempts, Instant parkedAt) {
    }

    public record DeadLetterList(long open, List<DeadLetterView> items) {
    }

    private final DeadLetterService service;
    private final ObjectMapper mapper;

    public DeadLetterController(DeadLetterService service, ObjectMapper mapper) {
        this.service = service;
        this.mapper = mapper;
    }

    @GetMapping
    public DeadLetterList list() {
        return new DeadLetterList(service.countOpen(), service.open().stream().map(this::view).toList());
    }

    @PostMapping("/{id}/retry")
    public ResponseEntity<Void> retry(@PathVariable long id) {
        service.retry(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/discard")
    public ResponseEntity<Void> discard(@PathVariable long id) {
        service.discard(id);
        return ResponseEntity.noContent().build();
    }

    private DeadLetterView view(DeadLetter d) {
        JsonNode payload;
        try {
            payload = d.payload() == null ? null : mapper.readTree(d.payload());
        } catch (Exception e) {
            payload = null;
        }
        return new DeadLetterView(d.id(), d.source(), d.eventId(), d.eventType(), d.aggregateId(), payload,
                d.error(), d.attempts(), d.parkedAt());
    }
}
