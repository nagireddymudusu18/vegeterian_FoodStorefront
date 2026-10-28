package in.foodapp.order.config;

import java.security.interfaces.RSAPublicKey;
import java.security.KeyFactory;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, SecurityProblemHandlers problems) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(e -> e.authenticationEntryPoint(problems).accessDeniedHandler(problems))
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/actuator/health/**", "/actuator/info", "/v3/api-docs/**",
                                "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        // key-enforced inside the controller (X-Internal-Key), not by JWT
                        .requestMatchers("/internal/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/orders/track/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/orders/restaurant", "/orders/restaurant/stream")
                                .hasAnyRole("RESTAURANT", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/orders").hasRole("CUSTOMER")
                        .requestMatchers(HttpMethod.GET, "/orders").hasRole("CUSTOMER")
                        .requestMatchers(HttpMethod.GET, "/orders/*").hasAnyRole("CUSTOMER", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/orders/*/stream").hasAnyRole("CUSTOMER", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/orders/*/cancel").hasRole("CUSTOMER")
                        .requestMatchers(HttpMethod.POST, "/orders/*/accept", "/orders/*/reject",
                                "/orders/*/preparing", "/orders/*/rider-assigned", "/orders/*/picked-up",
                                "/orders/*/deliver").hasAnyRole("RESTAURANT", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/orders/*/rider/picked-up", "/orders/*/rider/deliver")
                                .hasRole("PARTNER")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o
                        .jwt(j -> j.jwtAuthenticationConverter(jwtAuthenticationConverter()))
                        .authenticationEntryPoint(problems)
                        .accessDeniedHandler(problems));
        return http.build();
    }

    private JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(SecurityConfig::rolesToAuthorities);
        return converter;
    }

    private static Collection<GrantedAuthority> rolesToAuthorities(Jwt jwt) {
        List<String> roles = jwt.getClaimAsStringList("roles");
        if (roles == null) {
            return List.of();
        }
        return roles.stream()
                .map(r -> (GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + r))
                .collect(Collectors.toList());
    }

    @Bean
    JwtDecoder jwtDecoder(AppProperties props) {
        String pem = props.jwtPublicKeyPem();
        if (pem == null || pem.isBlank()) {
            log.warn("JWT_PUBLIC_KEY_PEM is not set; every authenticated request will be rejected");
            return token -> {
                throw new BadJwtException("JWT public key is not configured");
            };
        }
        try {
            String body = pem.replace("\\n", "\n")
                    .replace("-----BEGIN PUBLIC KEY-----", "")
                    .replace("-----END PUBLIC KEY-----", "")
                    .replaceAll("\\s", "");
            byte[] der = Base64.getDecoder().decode(body);
            RSAPublicKey key = (RSAPublicKey) KeyFactory.getInstance("RSA")
                    .generatePublic(new X509EncodedKeySpec(der));
            NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey(key).build();
            OAuth2TokenValidator<Jwt> validator = JwtValidators.createDefaultWithIssuer("identity-service");
            decoder.setJwtValidator(validator);
            return decoder;
        } catch (Exception e) {
            log.error("Invalid JWT_PUBLIC_KEY_PEM; every authenticated request will be rejected", e);
            return token -> {
                throw new BadJwtException("JWT public key is invalid");
            };
        }
    }
}
