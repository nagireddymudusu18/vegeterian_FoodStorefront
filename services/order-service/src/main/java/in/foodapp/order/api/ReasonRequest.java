package in.foodapp.order.api;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.Size;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ReasonRequest(@Size(max = 500) String reason) {
}
