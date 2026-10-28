package in.foodapp.identity.api;

import in.foodapp.identity.infra.jwt.JwtService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class JwksController {

    private final JwtService jwt;

    public JwksController(JwtService jwt) {
        this.jwt = jwt;
    }

    @GetMapping("/.well-known/jwks.json")
    public Map<String, Object> jwks() {
        return jwt.jwks();
    }
}
