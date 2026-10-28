package in.foodapp.payment.api;

import in.foodapp.payment.persistence.Payment;
import in.foodapp.payment.service.PaymentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @PostMapping("/payments")
    public ResponseEntity<PaymentResponse> create(@RequestHeader("Idempotency-Key") String idempotencyKey,
                                                  @Valid @RequestBody CreatePaymentRequest body,
                                                  Authentication authentication) {
        String key = requireKey(idempotencyKey);
        UUID customerId = subject(authentication);
        PaymentService.PaymentResult result =
                paymentService.create(customerId, key, body.orderId(), body.amountPaise());
        return ResponseEntity.status(result.replayed() ? HttpStatus.OK : HttpStatus.CREATED)
                .body(PaymentResponse.from(result.payment()));
    }

    @GetMapping("/payments/{id}")
    public PaymentResponse get(@PathVariable UUID id, Authentication authentication) {
        boolean admin = authentication.getAuthorities().stream().anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
        Payment p = paymentService.get(id, subject(authentication), admin);
        return PaymentResponse.from(p);
    }

    @PostMapping("/payments/{id}/refund")
    public ResponseEntity<RefundResponse> refund(@PathVariable UUID id,
                                                 @RequestHeader("Idempotency-Key") String idempotencyKey,
                                                 @Valid @RequestBody RefundRequestBody body) {
        PaymentService.RefundResult result = paymentService.refund(id, body.amountPaise(), requireKey(idempotencyKey));
        return ResponseEntity.status(result.replayed() ? HttpStatus.OK : HttpStatus.CREATED)
                .body(RefundResponse.from(result.refund()));
    }

    private static String requireKey(String key) {
        if (key == null || key.isBlank() || key.length() > 128) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid Idempotency-Key",
                    "Idempotency-Key must be 1-128 characters");
        }
        return key.trim();
    }

    private static UUID subject(Authentication authentication) {
        if (!(authentication.getPrincipal() instanceof Jwt jwt)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized", "JWT required");
        }
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized", "Token subject is not a UUID");
        }
    }
}
