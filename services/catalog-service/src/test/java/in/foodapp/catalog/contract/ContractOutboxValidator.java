package in.foodapp.catalog.contract;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.foodapp.catalog.events.OutboxValidator;
import org.springframework.stereotype.Component;

/**
 * Active in every Spring test of this service (found by component scan): any event written to the outbox must
 * satisfy its contract in contracts/events, and must be one this service is allowed to produce.
 */
@Component
class ContractOutboxValidator implements OutboxValidator {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public void validate(String type, String payloadJson) {
        ContractSchemas.assertProducedBy("catalog-service", type);
        try {
            ContractSchemas.assertValid(type, MAPPER.readTree(payloadJson));
        } catch (JsonProcessingException e) {
            throw new AssertionError("Event " + type + " has an unparsable payload", e);
        }
    }
}
