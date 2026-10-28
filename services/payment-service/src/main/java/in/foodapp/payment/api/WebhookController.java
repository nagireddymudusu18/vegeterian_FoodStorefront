package in.foodapp.payment.api;

import in.foodapp.payment.infra.gateway.PaymentGateway;
import in.foodapp.payment.service.WebhookService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.Map;

@RestController
public class WebhookController {

    private final PaymentGateway gateway;
    private final WebhookService webhookService;

    public WebhookController(PaymentGateway gateway, WebhookService webhookService) {
        this.gateway = gateway;
        this.webhookService = webhookService;
    }

    /** No JWT. Authenticated by the HMAC signature over the raw body. */
    @PostMapping("/webhooks/razorpay")
    public ResponseEntity<Map<String, String>> razorpay(
            @RequestBody byte[] rawBody,
            @RequestHeader(name = "X-Razorpay-Signature", required = false) String signature,
            @RequestHeader(name = "X-Razorpay-Event-Id", required = false) String eventId) {
        String body = new String(rawBody, StandardCharsets.UTF_8);
        if (!gateway.verifyWebhookSignature(body, signature)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid signature", "Webhook signature verification failed");
        }
        if (eventId == null || eventId.isBlank() || eventId.length() > 128) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Missing event id", "X-Razorpay-Event-Id header is required");
        }
        WebhookService.Outcome outcome = webhookService.handle(body, eventId.trim());
        return ResponseEntity.ok(Map.of("status", outcome.name()));
    }
}
