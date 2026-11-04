package in.foodapp.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.foodapp.identity.infra.email.EmailSender;
import in.foodapp.identity.infra.sms.SmsSender;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@SpringBootTest
@ActiveProfiles("local")
@AutoConfigureMockMvc
class RegistrationIT {

    static final TestDatabase.Conn DB = TestDatabase.start("identity", false);

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DB::url);
        registry.add("spring.datasource.username", DB::user);
        registry.add("spring.datasource.password", DB::password);
        registry.add("app.internal-feed-key", () -> "it-feed-key");
    }

    static class CapturingSmsSender implements SmsSender {
        final Map<String, String> lastCodeByPhone = new ConcurrentHashMap<>();

        @Override
        public void sendOtp(String e164Phone, String code) {
            lastCodeByPhone.put(e164Phone, code);
        }
    }

    /** Remembers the last link and kind sent to each address. */
    static class CapturingEmailSender implements EmailSender {
        final Map<String, String> lastLink = new ConcurrentHashMap<>();
        final Map<String, Kind> lastKind = new ConcurrentHashMap<>();

        @Override
        public void send(String to, Kind kind, String link) {
            lastLink.put(to, link);
            lastKind.put(to, kind);
        }
    }

    @TestConfiguration
    static class TestBeans {
        @Bean
        @Primary
        CapturingEmailSender capturingEmailSender() {
            return new CapturingEmailSender();
        }
        @Bean
        @Primary
        CapturingSmsSender capturingSmsSender() {
            return new CapturingSmsSender();
        }
    }

    private static final AtomicInteger IP = new AtomicInteger(1);

    @Autowired
    MockMvc mvc;
    @Autowired
    ObjectMapper mapper;
    @Autowired
    CapturingSmsSender sms;
    @Autowired
    CapturingEmailSender mail;
    @Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;

    /** UserContactUpdated events for a user, with the contact decrypted the way notification-service does. */
    private List<Map<String, String>> contactEvents(String userId) throws Exception {
        byte[] key = MessageDigest.getInstance("SHA-256")
                .digest("dev-only-contact-event-key".getBytes(StandardCharsets.UTF_8));
        List<String> payloads = jdbc.queryForList("SELECT payload::text FROM outbox WHERE type = 'UserContactUpdated' "
                + "AND aggregate_id = ?::uuid ORDER BY id", String.class, userId);
        List<Map<String, String>> out = new java.util.ArrayList<>();
        for (String json : payloads) {
            JsonNode p = mapper.readTree(json);
            Map<String, String> row = new java.util.HashMap<>();
            for (String field : new String[] {"phoneEnc", "emailEnc"}) {
                if (p.has(field)) {
                    byte[] data = Base64.getDecoder().decode(p.get(field).asText());
                    javax.crypto.Cipher c = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");
                    c.init(javax.crypto.Cipher.DECRYPT_MODE, new javax.crypto.spec.SecretKeySpec(key, "AES"),
                            new javax.crypto.spec.GCMParameterSpec(128, data, 0, 12));
                    row.put(field, new String(c.doFinal(data, 12, data.length - 12), StandardCharsets.UTF_8));
                }
            }
            out.add(row);
        }
        return out;
    }

    @Test
    void verifiedEmailAndPhoneArePublishedEncryptedButUnverifiedEmailIsNot() throws Exception {
        String email = email();
        register(email, "Sup3rSecret").andExpect(status().isAccepted());
        String userId = jdbc.queryForObject("SELECT aggregate_id::text FROM outbox WHERE type = 'UserRegistered' "
                + "ORDER BY id DESC LIMIT 1", String.class);
        assertTrue(contactEvents(userId).isEmpty(), "an unverified email must not be published");

        JsonNode verified = body(send("/auth/email/verify", Map.of("token", tokenFromMail(email), "password", "Sup3rSecret"))
                .andExpect(status().isOk()));
        assertEquals(List.of(Map.of("emailEnc", email.toLowerCase())), contactEvents(userId));
        String raw = jdbc.queryForObject("SELECT payload::text FROM outbox WHERE type = 'UserContactUpdated' "
                + "AND aggregate_id = ?::uuid", String.class, userId);
        assertTrue(!raw.toLowerCase().contains("example.com"), "the outbox must not hold the plain email");

        String auth = "Bearer " + verified.get("accessToken").asText();
        String phone = "9877700011";
        mvc.perform(post("/me/phone/request").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("phone", phone)))).andExpect(status().isAccepted());
        mvc.perform(post("/me/phone/verify").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("phone", phone, "code", sms.lastCodeByPhone.get("+91" + phone)))))
                .andExpect(status().isNoContent());
        assertEquals(List.of(Map.of("emailEnc", email.toLowerCase()), Map.of("phoneEnc", "+91" + phone)),
                contactEvents(userId));
    }

    @Test
    void aNewPhoneAccountPublishesItsPhone() throws Exception {
        String phone = "9822233344";
        send("/auth/otp/request", Map.of("phone", phone)).andExpect(status().isAccepted());
        String code = sms.lastCodeByPhone.get("+91" + phone);
        assertNotNull(code);
        send("/auth/otp/verify", Map.of("phone", phone, "code", code, "consent", CONSENT)).andExpect(status().isOk());
        String userId = jdbc.queryForObject("SELECT aggregate_id::text FROM outbox WHERE type = 'UserRegistered' "
                + "ORDER BY id DESC LIMIT 1", String.class);
        assertEquals(List.of(Map.of("phoneEnc", "+91" + phone)), contactEvents(userId));
    }

    private static final Map<String, Object> CONSENT =
            Map.of("purpose", "TERMS_AND_PRIVACY", "version", "v1", "granted", true);

    /** Each call comes from a fresh client IP so the per-IP throttle never interferes, except where tested. */
    private ResultActions send(String path, Object body, String ip) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON)
                .with(r -> {
                    r.setRemoteAddr(ip);
                    return r;
                })
                .content(mapper.writeValueAsString(body)));
    }

    private ResultActions send(String path, Object body) throws Exception {
        return send(path, body, "198.51.100." + IP.getAndIncrement());
    }

    private String email() {
        return "User." + UUID.randomUUID().toString().substring(0, 8) + "@Example.com";
    }

    private ResultActions register(String email, String password) throws Exception {
        return send("/auth/register", Map.of("name", "Asha Rao", "email", email, "password", password,
                "consent", CONSENT));
    }

    private JsonNode body(ResultActions a) throws Exception {
        return mapper.readTree(a.andReturn().getResponse().getContentAsString());
    }

    private String tokenFromMail(String email) {
        String link = mail.lastLink.get(email.toLowerCase());
        assertNotNull(link, "no email sent to " + email);
        return link.substring(link.indexOf("token=") + 6);
    }

    /** Registers, then redeems the emailed link; returns the sign-in tokens. */
    private JsonNode registerVerified(String email, String password) throws Exception {
        register(email, password).andExpect(status().isAccepted());
        return body(send("/auth/email/verify", Map.of("token", tokenFromMail(email), "password", password)).andExpect(status().isOk()));
    }

    @Test
    void registerNeedsVerificationThenLoginThenMe() throws Exception {
        String email = email();
        String registered = register(email, "Sup3rSecret").andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        assertTrue(!registered.contains("accessToken"));

        // right password, but the address is not verified yet
        send("/auth/login", Map.of("email", email, "password", "Sup3rSecret")).andExpect(status().isForbidden());

        JsonNode verified = body(send("/auth/email/verify", Map.of("token", tokenFromMail(email), "password", "Sup3rSecret"))
                .andExpect(status().isOk()));
        assertNotNull(verified.get("accessToken").asText());
        // the link is single use
        send("/auth/email/verify", Map.of("token", tokenFromMail(email), "password", "Sup3rSecret")).andExpect(status().isBadRequest());

        // email is case-insensitive
        JsonNode login = body(send("/auth/login", Map.of("email", email.toUpperCase(), "password", "Sup3rSecret"))
                .andExpect(status().isOk()));

        mvc.perform(get("/me").header("Authorization", "Bearer " + login.get("accessToken").asText()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Asha Rao"))
                .andExpect(jsonPath("$.hasPassword").value(true))
                .andExpect(jsonPath("$.emailVerified").value(true))
                .andExpect(jsonPath("$.email").value(org.hamcrest.Matchers.containsString("***@example.com")))
                .andExpect(jsonPath("$.phone").doesNotExist())
                .andExpect(jsonPath("$.roles[0]").value("CUSTOMER"));
    }

    @Test
    void verifyLinkAloneDoesNotGiveAccessWithoutTheRegisteredPassword() throws Exception {
        String email = email();
        register(email, "Att4ckerPass").andExpect(status().isAccepted());
        String token = tokenFromMail(email);
        send("/auth/email/verify", Map.of("token", token, "password", "Vict1mGuess")).andExpect(status().isUnauthorized());
        send("/auth/login", Map.of("email", email, "password", "Att4ckerPass")).andExpect(status().isForbidden());
        // a wrong attempt does not burn the link
        send("/auth/email/verify", Map.of("token", token, "password", "Att4ckerPass")).andExpect(status().isOk());
    }

    @Test
    void registeringAnExistingEmailLooksIdenticalAndTellsTheOwnerByEmail() throws Exception {
        String email = email();
        registerVerified(email, "Sup3rSecret");
        String fresh = register(email(), "Sup3rSecret").andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        String dup = register(email.toUpperCase(), "An0therPass").andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        assertEquals(fresh, dup);
        assertEquals(EmailSender.Kind.ALREADY_REGISTERED, mail.lastKind.get(email.toLowerCase()));
        // the existing password still works, the attempted one does not
        send("/auth/login", Map.of("email", email, "password", "Sup3rSecret")).andExpect(status().isOk());
        send("/auth/login", Map.of("email", email, "password", "An0therPass")).andExpect(status().isUnauthorized());
    }

    @Test
    void unverifiedSignupCanBeResentAndOnlyTheLatestLinkWorks() throws Exception {
        String email = email();
        register(email, "Sup3rSecret").andExpect(status().isAccepted());
        String first = tokenFromMail(email);
        send("/auth/email/resend", Map.of("email", email)).andExpect(status().isAccepted());
        String second = tokenFromMail(email);
        send("/auth/email/verify", Map.of("token", first, "password", "Sup3rSecret")).andExpect(status().isBadRequest());
        send("/auth/email/verify", Map.of("token", second, "password", "Sup3rSecret")).andExpect(status().isOk());
        // unknown and already-verified addresses get the same answer and no mail
        send("/auth/email/resend", Map.of("email", email())).andExpect(status().isAccepted());
        send("/auth/email/verify", Map.of("token", "nonsense", "password", "Sup3rSecret")).andExpect(status().isBadRequest());
    }

    @Test
    void forgotPasswordResetsEndsSessionsAndIsUniform() throws Exception {
        String email = email();
        JsonNode first = registerVerified(email, "Sup3rSecret");

        String known = send("/auth/password/forgot", Map.of("email", email)).andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        String unknown = send("/auth/password/forgot", Map.of("email", email())).andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        assertEquals(known, unknown);
        assertEquals(EmailSender.Kind.RESET_PASSWORD, mail.lastKind.get(email.toLowerCase()));
        String token = tokenFromMail(email);

        // a weak password is refused and does not burn the link
        send("/auth/password/reset", Map.of("token", token, "password", "weak")).andExpect(status().isBadRequest());
        send("/auth/password/reset", Map.of("token", token, "password", "N3wSecretPass"))
                .andExpect(status().isNoContent());
        send("/auth/password/reset", Map.of("token", token, "password", "Th1rdSecretPass"))
                .andExpect(status().isBadRequest());

        send("/auth/login", Map.of("email", email, "password", "Sup3rSecret")).andExpect(status().isUnauthorized());
        send("/auth/login", Map.of("email", email, "password", "N3wSecretPass")).andExpect(status().isOk());
        // the refresh token from before the reset no longer works
        send("/auth/refresh", Map.of("refreshToken", first.get("refreshToken").asText()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void resettingAlsoVerifiesAndUnlocks() throws Exception {
        String email = email();
        register(email, "Sup3rSecret").andExpect(status().isAccepted());
        send("/auth/password/forgot", Map.of("email", email)).andExpect(status().isAccepted());
        send("/auth/password/reset", Map.of("token", tokenFromMail(email), "password", "N3wSecretPass"))
                .andExpect(status().isNoContent());
        send("/auth/login", Map.of("email", email, "password", "N3wSecretPass")).andExpect(status().isOk());
    }

    @Test
    void emailAccountCanAddAPhoneButNotOneThatIsTaken() throws Exception {
        String auth = "Bearer " + registerVerified(email(), "Sup3rSecret").get("accessToken").asText();
        String phone = "9833344455";
        mvc.perform(post("/me/phone/request").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("phone", phone))))
                .andExpect(status().isAccepted());
        String code = sms.lastCodeByPhone.get("+91" + phone);
        mvc.perform(post("/me/phone/verify").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("phone", phone, "code", wrong(code)))))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/me/phone/verify").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("phone", phone, "code", code))))
                .andExpect(status().isNoContent());
        mvc.perform(get("/me").header("Authorization", auth)).andExpect(jsonPath("$.phone").exists());

        // a second email account cannot take the same number
        String auth2 = "Bearer " + registerVerified(email(), "Sup3rSecret").get("accessToken").asText();
        mvc.perform(post("/me/phone/request").header("Authorization", auth2).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("phone", phone))))
                .andExpect(status().isAccepted());
        String code2 = sms.lastCodeByPhone.get("+91" + phone);
        mvc.perform(post("/me/phone/verify").header("Authorization", auth2).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("phone", phone, "code", code2))))
                .andExpect(status().isConflict());
    }

    @Test
    void phoneEndpointsRequireAuthentication() throws Exception {
        send("/me/phone/request", Map.of("phone", "9844455566")).andExpect(status().isUnauthorized());
        send("/me/phone/verify", Map.of("phone", "9844455566", "code", "123456"))
                .andExpect(status().isUnauthorized());
    }

    private static String wrong(String code) {
        return "000000".equals(code) ? "111111" : "000000";
    }

    @Test
    void anUnverifiedClaimOnAPhoneAccountDoesNotBlockTheRealOwner() throws Exception {
        String phone = "9855566677";
        send("/auth/otp/request", Map.of("phone", phone)).andExpect(status().isAccepted());
        JsonNode otpTokens = body(send("/auth/otp/verify", Map.of("phone", phone,
                "code", sms.lastCodeByPhone.get("+91" + phone), "consent", CONSENT)).andExpect(status().isOk()));
        String victim = email();
        mvc.perform(post("/me/credentials")
                        .header("Authorization", "Bearer " + otpTokens.get("accessToken").asText())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("email", victim, "password", "Squat3rPass1"))))
                .andExpect(status().isNoContent());
        // the real owner signs up and verifies; the squatter's password does not work
        registerVerified(victim, "Sup3rSecret");
        send("/auth/login", Map.of("email", victim, "password", "Sup3rSecret")).andExpect(status().isOk());
        send("/auth/login", Map.of("email", victim, "password", "Squat3rPass1")).andExpect(status().isUnauthorized());
    }

    @Test
    void weakPasswordsAndBadEmailsAreRejected() throws Exception {
        register(email(), "short1").andExpect(status().isBadRequest());
        register(email(), "alllettersnodigit").andExpect(status().isBadRequest());
        register(email(), "123456789012").andExpect(status().isBadRequest());
        register(email(), "a1".repeat(40)).andExpect(status().isBadRequest());
        register("not-an-email", "Sup3rSecret").andExpect(status().isBadRequest());
    }

    @Test
    void registrationRequiresConsent() throws Exception {
        send("/auth/register", Map.of("name", "A", "email", email(), "password", "Sup3rSecret",
                "consent", Map.of("purpose", "TERMS_AND_PRIVACY", "version", "v1", "granted", false)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void wrongPasswordAndUnknownEmailGiveTheSameAnswer() throws Exception {
        String email = email();
        registerVerified(email, "Sup3rSecret");
        String wrong = send("/auth/login", Map.of("email", email, "password", "Wrong1234"))
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        String unknown = send("/auth/login", Map.of("email", email(), "password", "Wrong1234"))
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        assertEquals(mapper.readTree(wrong).get("detail"), mapper.readTree(unknown).get("detail"));
    }

    @Test
    void accountLocksAfterRepeatedFailuresEvenForTheRightPassword() throws Exception {
        String email = email();
        registerVerified(email, "Sup3rSecret");
        for (int i = 0; i < 5; i++) {
            send("/auth/login", Map.of("email", email, "password", "Wrong1234"))
                    .andExpect(status().isUnauthorized());
        }
        send("/auth/login", Map.of("email", email, "password", "Sup3rSecret"))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void loginIsThrottledPerClientIp() throws Exception {
        String ip = "203.0.113." + IP.getAndIncrement();
        int limited = 0;
        for (int i = 0; i < 25; i++) {
            int s = send("/auth/login", Map.of("email", email(), "password", "Wrong1234"), ip)
                    .andReturn().getResponse().getStatus();
            if (s == 429) {
                limited++;
            }
        }
        assertEquals(5, limited);
    }

    @Test
    void guestCheckoutStyleOtpLoginStoresTheName() throws Exception {
        String phone = "9811122233";
        send("/auth/otp/request", Map.of("phone", phone)).andExpect(status().isAccepted());
        String code = sms.lastCodeByPhone.get("+91" + phone);
        JsonNode tokens = body(send("/auth/otp/verify", Map.of("phone", phone, "code", code,
                "consent", CONSENT, "name", "Guest Gopal")).andExpect(status().isOk()));
        mvc.perform(get("/me").header("Authorization", "Bearer " + tokens.get("accessToken").asText()))
                .andExpect(jsonPath("$.name").value("Guest Gopal"))
                .andExpect(jsonPath("$.hasPassword").value(false));
    }

    @Test
    void otpAccountCanAddEmailAndPasswordAndThenLogInWithIt() throws Exception {
        String phone = "9822233344";
        send("/auth/otp/request", Map.of("phone", phone)).andExpect(status().isAccepted());
        String code = sms.lastCodeByPhone.get("+91" + phone);
        JsonNode tokens = body(send("/auth/otp/verify", Map.of("phone", phone, "code", code,
                "consent", CONSENT)).andExpect(status().isOk()));
        String auth = "Bearer " + tokens.get("accessToken").asText();
        String email = email();

        mvc.perform(post("/me/credentials").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("email", email, "password", "Sup3rSecret"))))
                .andExpect(status().isNoContent());
        // a second attempt is refused
        mvc.perform(post("/me/credentials").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("email", email(), "password", "Sup3rSecret"))))
                .andExpect(status().isConflict());

        // the new address must be verified before it can sign in
        send("/auth/login", Map.of("email", email, "password", "Sup3rSecret")).andExpect(status().isForbidden());
        send("/auth/email/verify", Map.of("token", tokenFromMail(email), "password", "Sup3rSecret")).andExpect(status().isOk());
        JsonNode login = body(send("/auth/login", Map.of("email", email, "password", "Sup3rSecret"))
                .andExpect(status().isOk()));
        mvc.perform(get("/me").header("Authorization", "Bearer " + login.get("accessToken").asText()))
                .andExpect(jsonPath("$.phone").exists())
                .andExpect(jsonPath("$.hasPassword").value(true));
    }

    @Test
    void credentialsEndpointRequiresAuthentication() throws Exception {
        send("/me/credentials", Map.of("email", email(), "password", "Sup3rSecret"))
                .andExpect(status().isUnauthorized());
    }
}
