package in.foodapp.identity.contract;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;

/** Loads the event contracts in contracts/events and validates payloads against them. */
public final class ContractSchemas {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final JsonSchemaFactory FACTORY = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012);
    private static final Map<String, JsonNode> RAW = new ConcurrentHashMap<>();
    private static final Map<String, JsonSchema> COMPILED = new ConcurrentHashMap<>();
    private static final Path DIR = locate();

    private ContractSchemas() {
    }

    private static Path locate() {
        Path p = Path.of("").toAbsolutePath();
        while (p != null) {
            Path candidate = p.resolve("contracts").resolve("events");
            if (Files.isDirectory(candidate)) {
                return candidate;
            }
            p = p.getParent();
        }
        throw new IllegalStateException("contracts/events not found above " + Path.of("").toAbsolutePath());
    }

    /** The whole contract document for an event type. A missing file means the event has no contract yet. */
    public static JsonNode contract(String type) {
        return RAW.computeIfAbsent(type, t -> {
            Path file = DIR.resolve(t + ".json");
            if (!Files.isRegularFile(file)) {
                throw new AssertionError("No contract for event type '" + t + "': add contracts/events/" + t + ".json");
            }
            try {
                return MAPPER.readTree(Files.readString(file));
            } catch (IOException e) {
                throw new IllegalStateException("Cannot read " + file, e);
            }
        });
    }

    /** Event types whose contract names this service as the producer. */
    public static List<String> typesProducedBy(String service) {
        try (Stream<Path> files = Files.list(DIR)) {
            return files.map(f -> f.getFileName().toString()).filter(n -> n.endsWith(".json"))
                    .map(n -> n.substring(0, n.length() - 5))
                    .filter(t -> service.equals(contract(t).path("x-producer").asText()))
                    .sorted().toList();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    /** A fresh copy of the golden example payload, safe to modify. */
    public static ObjectNode example(String type) {
        return (ObjectNode) contract(type).get("examples").get(0).deepCopy();
    }

    /** Validation messages; empty when the payload satisfies the contract. */
    public static List<String> errors(String type, JsonNode payload) {
        JsonSchema schema = COMPILED.computeIfAbsent(type, t -> FACTORY.getSchema(contract(t)));
        return schema.validate(payload).stream().map(Object::toString).sorted().toList();
    }

    public static void assertValid(String type, JsonNode payload) {
        List<String> errors = errors(type, payload);
        if (!errors.isEmpty()) {
            throw new AssertionError("Event " + type + " breaks its contract (contracts/events/" + type + ".json): "
                    + errors + " payload=" + payload);
        }
    }

    public static void assertProducedBy(String service, String type) {
        String producer = contract(type).path("x-producer").asText();
        if (!service.equals(producer)) {
            throw new AssertionError(service + " published " + type + " but its contract says the producer is " + producer);
        }
    }
}
