package in.foodapp.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.foodapp.identity.infra.email.EmailSender;
import in.foodapp.identity.infra.sms.SmsSender;
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
class AdminTeamIT {

    static final TestDatabase.Conn DB = TestDatabase.start("identity", false);
    static final String MAIN = "team.main@example.com";
    static final String PASSWORD = "Sup3rSecret";

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DB::url);
        registry.add("spring.datasource.username", DB::user);
        registry.add("spring.datasource.password", DB::password);
        registry.add("app.internal-feed-key", () -> "it-feed-key");
        registry.add("app.main-admin-email", () -> MAIN);
    }

    static class CapturingEmailSender implements EmailSender {
        final Map<String, String> lastLink = new ConcurrentHashMap<>();
        final Map<String, Kind> lastKind = new ConcurrentHashMap<>();

        @Override
        public void send(String to, Kind kind, String link) {
            lastLink.put(to, link);
            lastKind.put(to, kind);
        }
    }

    static class CapturingSmsSender implements SmsSender {
        final Map<String, String> lastCodeByPhone = new ConcurrentHashMap<>();

        @Override
        public void sendOtp(String e164Phone, String code) {
            lastCodeByPhone.put(e164Phone, code);
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
    private static final Map<String, Object> CONSENT =
            Map.of("purpose", "TERMS_AND_PRIVACY", "version", "v1", "granted", true);
    private static boolean mainRegistered;
    private static JsonNode mainCustomerTokens;

    @Autowired
    MockMvc mvc;
    @Autowired
    ObjectMapper mapper;
    @Autowired
    CapturingEmailSender mail;
    @Autowired
    CapturingSmsSender sms;

    private ResultActions postJson(String path, Object body) throws Exception {
        String ip = "192.0.2." + IP.getAndIncrement();
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON)
                .with(r -> {
                    r.setRemoteAddr(ip);
                    return r;
                })
                .content(mapper.writeValueAsString(body)));
    }

    private JsonNode json(ResultActions a) throws Exception {
        return mapper.readTree(a.andReturn().getResponse().getContentAsString());
    }

    private String uniqueEmail(String prefix) {
        return prefix + "." + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
    }

    /** Registers and redeems the verify link; this is the ordinary (non-admin) sign-in. */
    private JsonNode signUp(String email) throws Exception {
        postJson("/auth/register", Map.of("name", "Team Tester", "email", email, "password", PASSWORD,
                "consent", CONSENT)).andExpect(status().isAccepted());
        String link = mail.lastLink.get(email);
        assertNotNull(link);
        return json(postJson("/auth/email/verify", Map.of("token", link.substring(link.indexOf("token=") + 6),
                "password", PASSWORD)).andExpect(status().isOk()));
    }

    private synchronized JsonNode mainCustomerTokens() throws Exception {
        if (!mainRegistered) {
            mainCustomerTokens = signUp(MAIN);
            mainRegistered = true;
        }
        return mainCustomerTokens;
    }

    private JsonNode adminLogin(String email) throws Exception {
        return json(postJson("/auth/admin/login", Map.of("email", email, "password", PASSWORD)));
    }

    private String bearer(JsonNode tokens) {
        return "Bearer " + tokens.get("accessToken").asText();
    }

    private String mainAdmin() throws Exception {
        mainCustomerTokens();
        return bearer(adminLogin(MAIN).get("tokens"));
    }

    private void setFlag(String admin, String key, boolean enabled) throws Exception {
        mvc.perform(put("/admin/flags/" + key).header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":" + enabled + "}"))
                .andExpect(status().isOk());
    }

    /** Reads the roles claim straight from the access token: that, not /me, is what other services trust. */
    private void assertRoles(String bearer, boolean admin, boolean superAdmin) throws Exception {
        String payload = bearer.split("\\.")[1];
        JsonNode roles = mapper.readTree(java.util.Base64.getUrlDecoder().decode(payload)).get("roles");
        assertEquals(admin, roles.toString().contains("\"ADMIN\""), "ADMIN in " + roles);
        assertEquals(superAdmin, roles.toString().contains("SUPER_ADMIN"), "SUPER_ADMIN in " + roles);
    }

    @Test
    void adminsSignInOnlyByEmailAndPasswordAndOnlyTheAdminSessionKeepsAdminRoles() throws Exception {
        JsonNode customerTokens = mainCustomerTokens();
        // the ordinary verify sign-in never carries admin roles, even for the main admin
        assertRoles(bearer(customerTokens), false, false);
        mvc.perform(get("/admin/flags").header("Authorization", bearer(customerTokens)))
                .andExpect(status().isForbidden());
        postJson("/auth/login", Map.of("email", MAIN, "password", PASSWORD)).andExpect(status().isForbidden());

        postJson("/auth/admin/login", Map.of("email", MAIN, "password", "Wr0ngPassword"))
                .andExpect(status().isUnauthorized());
        JsonNode login = adminLogin(MAIN);
        assertTrue(!login.has("challengeId"));
        assertRoles(bearer(login.get("tokens")), true, true);

        // refreshing keeps the admin roles only for the admin sign-in's token family
        JsonNode adminRefreshed = json(postJson("/auth/refresh",
                Map.of("refreshToken", login.get("tokens").get("refreshToken").asText())).andExpect(status().isOk()));
        assertRoles(bearer(adminRefreshed), true, true);
        JsonNode customerRefreshed = json(postJson("/auth/refresh",
                Map.of("refreshToken", customerTokens.get("refreshToken").asText())).andExpect(status().isOk()));
        assertRoles(bearer(customerRefreshed), false, false);

        // a plain customer cannot use the admin sign-in
        String customer = uniqueEmail("plain.customer");
        signUp(customer);
        postJson("/auth/admin/login", Map.of("email", customer, "password", PASSWORD))
                .andExpect(status().isForbidden());
    }

    @Test
    void phoneSignInIsRefusedForAdminAccounts() throws Exception {
        String auth = bearer(mainCustomerTokens());
        String phone = "9855566677";
        mvc.perform(post("/me/phone/request").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("phone", phone)))).andExpect(status().isAccepted());
        mvc.perform(post("/me/phone/verify").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("phone", phone, "code",
                        sms.lastCodeByPhone.get("+91" + phone))))).andExpect(status().isNoContent());

        postJson("/auth/otp/request", Map.of("phone", phone)).andExpect(status().isAccepted());
        postJson("/auth/otp/verify", Map.of("phone", phone, "code", sms.lastCodeByPhone.get("+91" + phone)))
                .andExpect(status().isForbidden());
    }

    @Test
    void emailCodeIsRequiredOnlyWhileTheFlagIsOn() throws Exception {
        String admin = mainAdmin();
        setFlag(admin, "admin_login_code", true);
        try {
            JsonNode challenge = adminLogin(MAIN);
            assertTrue(!challenge.has("tokens"));
            String challengeId = challenge.get("challengeId").asText();
            assertEquals(EmailSender.Kind.ADMIN_LOGIN_CODE, mail.lastKind.get(MAIN));
            String code = mail.lastLink.get(MAIN);
            String wrong = code.equals("000000") ? "000001" : "000000";

            postJson("/auth/admin/login/verify", Map.of("challengeId", challengeId, "code", wrong))
                    .andExpect(status().isUnauthorized());
            JsonNode done = json(postJson("/auth/admin/login/verify", Map.of("challengeId", challengeId,
                    "code", code)).andExpect(status().isOk()));
            assertRoles(bearer(done), true, true);
            // single use
            postJson("/auth/admin/login/verify", Map.of("challengeId", challengeId, "code", code))
                    .andExpect(status().isUnauthorized());

            // five wrong guesses burn the code, even if the sixth is right
            String second = adminLogin(MAIN).get("challengeId").asText();
            String secondCode = mail.lastLink.get(MAIN);
            String bad = secondCode.equals("111111") ? "222222" : "111111";
            for (int i = 0; i < 5; i++) {
                postJson("/auth/admin/login/verify", Map.of("challengeId", second, "code", bad))
                        .andExpect(status().isUnauthorized());
            }
            postJson("/auth/admin/login/verify", Map.of("challengeId", second, "code", secondCode))
                    .andExpect(status().isUnauthorized());
        } finally {
            setFlag(admin, "admin_login_code", false);
        }
        assertTrue(!adminLogin(MAIN).has("challengeId"));
    }

    @Test
    void mainAdminInvitesAndRemovesAdminsAndOnlyTheMainAdminCanManageTheTeam() throws Exception {
        String main = mainAdmin();
        String inviteeEmail = uniqueEmail("invitee");
        JsonNode inviteeTokens = signUp(inviteeEmail);
        String invitee = bearer(inviteeTokens);

        mvc.perform(get("/admin/team")).andExpect(status().isUnauthorized());
        mvc.perform(get("/admin/team").header("Authorization", invitee)).andExpect(status().isForbidden());
        mvc.perform(post("/admin/team/invites").header("Authorization", main).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"not-an-email\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/admin/team/invites").header("Authorization", main).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + MAIN + "\"}")).andExpect(status().isBadRequest());

        mvc.perform(post("/admin/team/invites").header("Authorization", main).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + inviteeEmail.toUpperCase() + "\"}")).andExpect(status().isAccepted());
        assertEquals(EmailSender.Kind.ADMIN_INVITE, mail.lastKind.get(inviteeEmail));
        String link = mail.lastLink.get(inviteeEmail);
        String token = link.substring(link.indexOf("token=") + 6);
        assertTrue(link.contains("/admin/accept"));
        mvc.perform(get("/admin/team").header("Authorization", main)).andExpect(status().isOk())
                .andExpect(jsonPath("$.members[0].main").value(true))
                .andExpect(jsonPath("$.invites[0].email").exists());

        // someone else's password cannot redeem it, and neither can a wrong token
        String stranger = uniqueEmail("stranger");
        signUp(stranger);
        postJson("/auth/admin/invite/accept", Map.of("token", token, "email", stranger, "password", PASSWORD))
                .andExpect(status().isBadRequest());
        postJson("/auth/admin/invite/accept", Map.of("token", "bogus", "email", inviteeEmail, "password", PASSWORD))
                .andExpect(status().isBadRequest());
        postJson("/auth/admin/login", Map.of("email", inviteeEmail, "password", PASSWORD))
                .andExpect(status().isForbidden());

        postJson("/auth/admin/invite/accept", Map.of("token", token, "email", inviteeEmail, "password", PASSWORD))
                .andExpect(status().isNoContent());
        postJson("/auth/admin/invite/accept", Map.of("token", token, "email", inviteeEmail, "password", PASSWORD))
                .andExpect(status().isBadRequest());
        // sessions that existed before the grant can no longer be refreshed
        postJson("/auth/refresh", Map.of("refreshToken", inviteeTokens.get("refreshToken").asText()))
                .andExpect(status().isUnauthorized());

        JsonNode inviteeAdmin = adminLogin(inviteeEmail);
        String inviteeAdminBearer = bearer(inviteeAdmin.get("tokens"));
        assertRoles(inviteeAdminBearer, true, false);
        mvc.perform(get("/admin/flags").header("Authorization", inviteeAdminBearer)).andExpect(status().isOk());
        mvc.perform(get("/admin/team").header("Authorization", inviteeAdminBearer))
                .andExpect(status().isForbidden());
        mvc.perform(post("/admin/team/invites").header("Authorization", inviteeAdminBearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"x@example.com\"}"))
                .andExpect(status().isForbidden());

        JsonNode team = json(mvc.perform(get("/admin/team").header("Authorization", main)).andExpect(status().isOk()));
        assertEquals(2, team.get("members").size());
        assertEquals(0, team.get("invites").size());
        String inviteeId = null;
        for (JsonNode m : team.get("members")) {
            if (!m.get("main").asBoolean()) {
                inviteeId = m.get("userId").asText();
            }
        }
        assertNotNull(inviteeId);
        String mainId = team.get("members").get(0).get("userId").asText();

        mvc.perform(delete("/admin/team/members/" + mainId).header("Authorization", main))
                .andExpect(status().isBadRequest());
        mvc.perform(delete("/admin/team/members/" + UUID.randomUUID()).header("Authorization", main))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/admin/team/members/" + inviteeId).header("Authorization", main))
                .andExpect(status().isNoContent());
        mvc.perform(delete("/admin/team/members/" + inviteeId).header("Authorization", main))
                .andExpect(status().isNotFound());
        postJson("/auth/refresh", Map.of("refreshToken", inviteeAdmin.get("tokens").get("refreshToken").asText()))
                .andExpect(status().isUnauthorized());
        postJson("/auth/admin/login", Map.of("email", inviteeEmail, "password", PASSWORD))
                .andExpect(status().isForbidden());
    }

    @Test
    void invitesCanBeRevokedAndOnlyTheNewestInviteForAnAddressWorks() throws Exception {
        String main = mainAdmin();
        String email = uniqueEmail("revoked");
        signUp(email);

        mvc.perform(post("/admin/team/invites").header("Authorization", main).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\"}")).andExpect(status().isAccepted());
        String first = mail.lastLink.get(email);
        mvc.perform(post("/admin/team/invites").header("Authorization", main).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\"}")).andExpect(status().isAccepted());
        String second = mail.lastLink.get(email);
        assertTrue(!first.equals(second));
        postJson("/auth/admin/invite/accept", Map.of("token", first.substring(first.indexOf("token=") + 6),
                "email", email, "password", PASSWORD)).andExpect(status().isBadRequest());

        JsonNode team = json(mvc.perform(get("/admin/team").header("Authorization", main)).andExpect(status().isOk()));
        String inviteId = null;
        for (JsonNode i : team.get("invites")) {
            inviteId = i.get("id").asText();
        }
        assertNotNull(inviteId);
        mvc.perform(delete("/admin/team/invites/" + inviteId).header("Authorization", main))
                .andExpect(status().isNoContent());
        mvc.perform(delete("/admin/team/invites/" + inviteId).header("Authorization", main))
                .andExpect(status().isNotFound());
        postJson("/auth/admin/invite/accept", Map.of("token", second.substring(second.indexOf("token=") + 6),
                "email", email, "password", PASSWORD)).andExpect(status().isBadRequest());
    }
}
