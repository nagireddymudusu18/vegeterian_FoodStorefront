package in.foodapp.order.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class OrderNumbersTest {

    @Test
    void generatedNumbersAreTenCharactersAndRoundTrip() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 500; i++) {
            String raw = OrderNumbers.generate();
            assertThat(raw).hasSize(10).matches("[0-9A-HJKMNP-TV-Z]{10}");
            assertThat(OrderNumbers.parse(OrderNumbers.display(raw))).contains(raw);
            seen.add(raw);
        }
        assertThat(seen).hasSize(500);
    }

    @Test
    void displayFormatHasPrefixAndGroups() {
        assertThat(OrderNumbers.display("7K3M9QX2RA")).isEqualTo("FA-7K3M9-QX2RA");
    }

    @Test
    void parseIsForgiving() {
        assertThat(OrderNumbers.parse("fa-7k3m9-qx2ra")).contains("7K3M9QX2RA");
        assertThat(OrderNumbers.parse(" 7k3m9 qx2ra ")).contains("7K3M9QX2RA");
        assertThat(OrderNumbers.parse("FA7K3M9QX2RA")).contains("7K3M9QX2RA");
        assertThat(OrderNumbers.parse("FA-OIL00-00000")).contains("0110000000");
    }

    @Test
    void parseRejectsGarbage() {
        assertThat(OrderNumbers.parse(null)).isEmpty();
        assertThat(OrderNumbers.parse("")).isEmpty();
        assertThat(OrderNumbers.parse("FA-123")).isEmpty();
        assertThat(OrderNumbers.parse("FA-7K3M9-QX2R!")).isEmpty();
        assertThat(OrderNumbers.parse("FA-7K3M9-QX2RU")).isEmpty();
        assertThat(OrderNumbers.parse("x".repeat(100))).isEmpty();
        assertThat(OrderNumbers.parse("00000000-0000-0000-0000-000000000000")).isEmpty();
    }
}
