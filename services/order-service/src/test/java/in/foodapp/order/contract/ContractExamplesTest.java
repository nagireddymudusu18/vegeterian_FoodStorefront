package in.foodapp.order.contract;

import static org.junit.jupiter.api.Assertions.assertFalse;

import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

/** The contracts this service produces are themselves sound: each golden example satisfies its own schema. */
class ContractExamplesTest {

    private static final String SERVICE = "order-service";

    @Test
    void thisServiceProducesAtLeastOneContractedEvent() {
        assertFalse(ContractSchemas.typesProducedBy(SERVICE).isEmpty());
    }

    @Test
    void everyGoldenExampleSatisfiesItsSchema() {
        for (String type : ContractSchemas.typesProducedBy(SERVICE)) {
            ContractSchemas.assertValid(type, ContractSchemas.example(type));
        }
    }

    @Test
    void schemasRejectMissingAndUnknownFields() {
        for (String type : ContractSchemas.typesProducedBy(SERVICE)) {
            ObjectNode extra = ContractSchemas.example(type);
            extra.put("surprise", "x");
            assertFalse(ContractSchemas.errors(type, extra).isEmpty(), type + " accepted an undeclared field");

            String first = ContractSchemas.contract(type).get("required").get(0).asText();
            ObjectNode missing = ContractSchemas.example(type);
            missing.remove(first);
            assertFalse(ContractSchemas.errors(type, missing).isEmpty(), type + " accepted a payload without " + first);
        }
    }
}
