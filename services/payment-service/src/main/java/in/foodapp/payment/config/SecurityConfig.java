package in.foodapp.payment.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;

import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/**
 * JWTs are validated locally with the identity-service public key (RS256). /internal/** and /webhooks/**
 * are not JWT-protected; they carry their own X-Internal-Key / HMAC signature checks in the controllers.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    public static final String ISSUER = "identity-service";

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health/**", "/actuator/info", "/actuator/prometheus").permitAll()
                        .requestMatchers("/internal/**").permitAll()
                        .requestMatchers("/webhooks/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers(HttpMethod.POST, "/payments").hasRole("CUSTOMER")
                        .requestMatchers(HttpMethod.POST, "/payments/*/refund").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/payments/*").authenticated()
                        .anyRequest().denyAll())
                .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(jwtAuthenticationConverter())));
        return http.build();
    }

    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter granted = new JwtGrantedAuthoritiesConverter();
        granted.setAuthoritiesClaimName("roles");
        granted.setAuthorityPrefix("ROLE_");
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(granted);
        return converter;
    }

    @Bean
    JwtDecoder jwtDecoder(@Value("${app.jwt.public-key-pem:}") String pem) {
        if (pem == null || pem.isBlank()) {
            throw new IllegalStateException("JWT_PUBLIC_KEY_PEM must be set (identity-service RS256 public key, PEM)");
        }
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey(parsePublicKey(pem)).build();
        OAuth2TokenValidator<Jwt> validator = JwtValidators.createDefaultWithIssuer(ISSUER);
        decoder.setJwtValidator(validator);
        return decoder;
    }

    static RSAPublicKey parsePublicKey(String pem) {
        String normalised = pem.replace("\\n", "\n");
        String base64 = normalised
                .replace("-----BEGIN PUBLIC KEY-----", "")
                .replace("-----END PUBLIC KEY-----", "")
                .replaceAll("\\s", "");
        try {
            byte[] der = Base64.getDecoder().decode(base64);
            return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalStateException("JWT_PUBLIC_KEY_PEM is not a valid X.509 RSA public key PEM", e);
        }
    }
}
