package in.foodapp.fleet.api;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public final class Requests {

    private Requests() {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Register(@NotBlank @Size(max = 80) String name, @NotBlank @Size(max = 40) String vehicle) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Online(@NotNull Boolean online) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Assign(@NotNull UUID partnerId) {
    }
}