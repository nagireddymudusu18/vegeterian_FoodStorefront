package in.foodapp.identity.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import in.foodapp.identity.api.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PhoneNormalizerTest {

    private final PhoneNormalizer normalizer = new PhoneNormalizer();

    @ParameterizedTest
    @ValueSource(strings = {
            "9876543210", "+919876543210", "919876543210", "09876543210",
            "+91 98765 43210", "98765-43210", " +91-(98765)43210 "})
    void normalisesValidNumbersToE164(String input) {
        assertEquals("+919876543210", normalizer.normalise(input));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "5876543210", "1234567890", "987654321", "98765432101", "+14155550123", "+9198765", "abcdefghij",
            "", "   ", "+91 5876543210", "0919876543210"})
    void rejectsInvalidNumbers(String input) {
        assertThrows(ApiException.class, () -> normalizer.normalise(input));
    }

    @Test
    void rejectsNull() {
        assertThrows(ApiException.class, () -> normalizer.normalise(null));
    }

    @Test
    void acceptsAllValidLeadingDigits() {
        for (char c : new char[]{'6', '7', '8', '9'}) {
            assertEquals("+91" + c + "123456789", normalizer.normalise(c + "123456789"));
        }
    }

    @Test
    void masksAllButLastFourDigits() {
        assertEquals("+91XXXXXX3210", PhoneNormalizer.mask("+919876543210"));
    }
}
