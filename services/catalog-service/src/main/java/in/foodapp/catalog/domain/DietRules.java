package in.foodapp.catalog.domain;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Pure domain rules for dietary flags. No framework dependencies.
 *
 * <ul>
 *   <li>vegan implies pure-veg, and no dairy/ghee/honey (plus everything pure-veg forbids)</li>
 *   <li>Jain implies pure-veg, and no onion/garlic/potato/carrot/radish/beet/ginger/turnip/mushroom family</li>
 *   <li>pure-veg implies no meat/fish/egg/gelatin/carmine/rennet/bone-char</li>
 * </ul>
 *
 * Ingredient matching is word based (so "eggplant" is not "egg"), tolerates simple plurals, and ignores
 * plant-based qualifiers such as "coconut milk" or "cocoa butter".
 */
public final class DietRules {

    private record Term(String label, List<String> words) {
        static Term of(String label) {
            return new Term(label, tokenize(label));
        }
    }

    private static final Set<String> PLANT_QUALIFIERS = Set.of(
            "coconut", "almond", "soy", "soya", "oat", "rice", "cashew", "peanut", "cocoa", "shea",
            "plant", "vegan", "nut", "hazelnut", "pistachio");

    private static final Set<String> NEXT_WORD_EXEMPTIONS = Set.of("bean", "beans", "squash", "lettuce");

    private static final List<Term> NON_VEG = termsOf(
            "meat", "chicken", "mutton", "lamb", "pork", "beef", "bacon", "ham", "fish", "prawn", "shrimp",
            "crab", "lobster", "squid", "tuna", "salmon", "anchovy", "anchovies", "sausage", "lard", "tallow",
            "egg", "gelatin", "gelatine", "carmine", "cochineal", "rennet", "bone char");

    private static final List<Term> ANIMAL_DERIVED_NON_VEGAN = termsOf(
            "milk", "cream", "butter", "ghee", "cheese", "paneer", "curd", "yogurt", "yoghurt", "dahi",
            "khoya", "mawa", "whey", "casein", "lactose", "buttermilk", "honey");

    private static final List<Term> JAIN_FORBIDDEN = termsOf(
            "onion", "garlic", "potato", "carrot", "radish", "beet", "beetroot", "ginger", "turnip",
            "mushroom", "yam", "shallot", "leek", "scallion");

    private DietRules() {
    }

    /** Returns all violations (empty list when the combination is valid). */
    public static List<String> findViolations(boolean pureVeg, boolean vegan, boolean jain,
                                              Collection<String> ingredients) {
        List<String> violations = new ArrayList<>();
        if (vegan && !pureVeg) {
            violations.add("a vegan item must also be marked pure-veg");
        }
        if (jain && !pureVeg) {
            violations.add("a Jain item must also be marked pure-veg");
        }
        Collection<String> items = ingredients == null ? List.of() : ingredients;
        if (pureVeg || vegan || jain) {
            collect(violations, items, NON_VEG, "pure-veg", false);
        }
        if (vegan) {
            collect(violations, items, ANIMAL_DERIVED_NON_VEGAN, "vegan", true);
        }
        if (jain) {
            collect(violations, items, JAIN_FORBIDDEN, "Jain", false);
        }
        return violations;
    }

    /** Validates and throws {@link DietRuleViolationException} when any rule is broken. */
    public static void validate(boolean pureVeg, boolean vegan, boolean jain, Collection<String> ingredients) {
        List<String> violations = findViolations(pureVeg, vegan, jain, ingredients);
        if (!violations.isEmpty()) {
            throw new DietRuleViolationException(violations);
        }
    }

    private static void collect(List<String> out, Collection<String> ingredients, List<Term> terms,
                                String dietLabel, boolean plantQualifierExempt) {
        for (String ingredient : ingredients) {
            if (ingredient == null) {
                continue;
            }
            List<String> words = tokenize(ingredient);
            for (Term term : terms) {
                if (containsTerm(words, term.words(), plantQualifierExempt)) {
                    out.add("ingredient '" + ingredient.trim() + "' (" + term.label()
                            + ") is not permitted in a " + dietLabel + " item");
                    break;
                }
            }
        }
    }

    private static boolean containsTerm(List<String> words, List<String> term, boolean plantQualifierExempt) {
        for (int i = 0; i + term.size() <= words.size(); i++) {
            boolean match = true;
            for (int j = 0; j < term.size(); j++) {
                if (!wordMatches(words.get(i + j), term.get(j))) {
                    match = false;
                    break;
                }
            }
            if (!match) {
                continue;
            }
            if (plantQualifierExempt) {
                if (i > 0 && PLANT_QUALIFIERS.contains(words.get(i - 1))) {
                    continue;
                }
                int next = i + term.size();
                if (next < words.size() && NEXT_WORD_EXEMPTIONS.contains(words.get(next))) {
                    continue;
                }
            }
            return true;
        }
        return false;
    }

    private static boolean wordMatches(String word, String term) {
        return word.equals(term) || word.equals(term + "s") || word.equals(term + "es");
    }

    private static List<String> tokenize(String text) {
        List<String> out = new ArrayList<>();
        for (String part : text.toLowerCase(Locale.ROOT).split("[^a-z]+")) {
            if (!part.isEmpty()) {
                out.add(part);
            }
        }
        return out;
    }

    private static List<Term> termsOf(String... labels) {
        List<Term> terms = new ArrayList<>();
        for (String label : labels) {
            terms.add(Term.of(label));
        }
        return List.copyOf(terms);
    }
}
