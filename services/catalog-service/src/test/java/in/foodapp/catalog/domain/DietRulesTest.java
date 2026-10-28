package in.foodapp.catalog.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class DietRulesTest {

    @Test
    void veganRequiresPureVegFlag() {
        assertThatThrownBy(() -> DietRules.validate(false, true, false, List.of("rice")))
                .isInstanceOf(DietRuleViolationException.class)
                .hasMessageContaining("vegan item must also be marked pure-veg");
    }

    @Test
    void jainRequiresPureVegFlag() {
        assertThatThrownBy(() -> DietRules.validate(false, false, true, List.of("rice")))
                .isInstanceOf(DietRuleViolationException.class)
                .hasMessageContaining("Jain item must also be marked pure-veg");
    }

    @ParameterizedTest
    @ValueSource(strings = {"Chicken breast", "mutton", "Fish sauce", "egg yolk", "Eggs", "gelatin",
            "carmine", "rennet", "bone-char sugar", "Prawns"})
    void pureVegRejectsNonVegIngredients(String ingredient) {
        assertThatThrownBy(() -> DietRules.validate(true, false, false, List.of("rice", ingredient)))
                .isInstanceOf(DietRuleViolationException.class);
    }

    @Test
    void pureVegAllowsDairyAndHoney() {
        assertThatCode(() -> DietRules.validate(true, false, false,
                List.of("paneer", "ghee", "honey", "milk", "butter"))).doesNotThrowAnyException();
    }

    @Test
    void eggplantIsNotEgg() {
        assertThatCode(() -> DietRules.validate(true, false, false, List.of("eggplant", "Eggless mayo")))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"milk", "Ghee", "honey", "paneer", "butter", "curd", "cheese", "cream",
            "egg", "chicken", "fish", "gelatin", "carmine", "bone char", "rennet", "whey"})
    void veganRejectsAnimalDerivedIngredients(String ingredient) {
        assertThatThrownBy(() -> DietRules.validate(true, true, false, List.of(ingredient)))
                .isInstanceOf(DietRuleViolationException.class);
    }

    @Test
    void veganAllowsPlantBasedMilksAndButters() {
        assertThatCode(() -> DietRules.validate(true, true, false,
                List.of("coconut milk", "Almond Milk", "cocoa butter", "peanut butter", "oat milk",
                        "coconut cream", "soy milk", "butter beans", "eggplant")))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"onion", "Garlic", "potato", "sweet potato", "carrot", "radish", "beetroot",
            "ginger", "turnip", "mushrooms", "Spring Onions", "potatoes"})
    void jainRejectsRootVegetablesAndMushrooms(String ingredient) {
        assertThatThrownBy(() -> DietRules.validate(true, false, true, List.of(ingredient)))
                .isInstanceOf(DietRuleViolationException.class);
    }

    @Test
    void jainAllowsDairyAndAboveGroundVegetables() {
        assertThatCode(() -> DietRules.validate(true, false, true,
                List.of("paneer", "ghee", "tomato", "peas", "capsicum", "asafoetida")))
                .doesNotThrowAnyException();
    }

    @Test
    void jainAlsoEnforcesPureVegIngredients() {
        assertThatThrownBy(() -> DietRules.validate(true, false, true, List.of("chicken")))
                .isInstanceOf(DietRuleViolationException.class);
    }

    @Test
    void veganAndJainCombine() {
        assertThatThrownBy(() -> DietRules.validate(true, true, true, List.of("ghee", "onion")))
                .isInstanceOfSatisfying(DietRuleViolationException.class,
                        e -> assertThat(e.getViolations()).hasSize(2));
        assertThatCode(() -> DietRules.validate(true, true, true, List.of("sabudana", "peanuts", "cumin")))
                .doesNotThrowAnyException();
    }

    @Test
    void unflaggedItemsMayContainAnything() {
        assertThat(DietRules.findViolations(false, false, false, List.of("chicken", "onion", "ghee"))).isEmpty();
    }

    @Test
    void nullIngredientsAreTolerated() {
        assertThat(DietRules.findViolations(true, true, true, null)).isEmpty();
    }
}
