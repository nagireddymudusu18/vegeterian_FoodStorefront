package in.foodapp.order.api;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

@JsonIgnoreProperties(ignoreUnknown = true)
public record DeliverRequest(@NotBlank @Pattern(regexp = "\\d{4}") String otp) {
}
