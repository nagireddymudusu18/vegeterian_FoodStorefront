package in.foodapp.catalog.domain;

import java.util.List;

/** Thrown when a menu item's diet flags contradict each other or its ingredients. Mapped to HTTP 422. */
public class DietRuleViolationException extends RuntimeException {

    private final List<String> violations;

    public DietRuleViolationException(List<String> violations) {
        super("Diet rule violation: " + String.join("; ", violations));
        this.violations = List.copyOf(violations);
    }

    public List<String> getViolations() {
        return violations;
    }
}
