package in.foodapp.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.foodapp.identity.infra.email.EmailSender;
import java.util.Map;
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
class FeatureFlagIT {

    static final TestDatabase.Conn DB = TestDatabase.start("identity", false);
    static final String ADMIN_EMAIL = "flags.admin@example.com";

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DB::url);
        registry.add("spring.datasource.username", DB::user);
        registry.add("spring.datasource.password", DB::password);
        registry.add("app.internal-feed-key", () -> "it-feed-key");
        registry.add("app.main-admin-email", () -> ADMIN_EMAIL);
    }

    private static boolean adminRegistered;

    static class CapturingEmailSender implements EmailSender {
        final Map<String, String> lastLink = new ConcurrentHashMap<>();

        @Override
        public void send(String to, Kind kind, String link) {
            lastLink.put(to, link);
        }
    }

    @TestConfiguration
    static class TestBeans {
        @Bean
        @Primary
        CapturingEmailSender capturingEmailSender() {
            return new CapturingEmailSender();
        }
    }

    private static final AtomicInteger IP = new AtomicInteger(1);
    private static final Map<String, Object> CONSENT =
            Map.of("purpose", "TERMS_AND_PRIVACY", "version", "v1", "granted", true);

    @Autowired
    MockMvc mvc;
    @Autowired
    ObjectMapper mapper;
    @Autowired
    CapturingEmailSender mail;

    private ResultActions postJson(String path, Object body) throws Exception {
        String ip = "203.0.113." + IP.getAndIncrement();
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON)
                .with(r -> {
                    r.setRemoteAddr(ip);
                    return r;
                })
                .content(mapper.writeValueAsString(body)));
    }

    private String signUpAndVerify(String email) throws Exception {
        postJson("/auth/register", Map.of("name", "Flag Tester", "email", email, "password", "Sup3rSecret",
                "consent", CONSENT)).andExpect(status().isAccepted());
        String link = mail.lastLink.get(email);
        JsonNode tokens = mapper.readTree(postJson("/auth/email/verify",
                Map.of("token", link.substring(link.indexOf("token=") + 6), "password", "Sup3rSecret"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        return "Bearer " + tokens.get("accessToken").asText();
    }

    /** The main admin signs in through the admin sign-in (email and password). */
    private synchronized String adminToken() throws Exception {
        if (!adminRegistered) {
            signUpAndVerify(ADMIN_EMAIL);
            adminRegistered = true;
        }
        JsonNode r = mapper.readTree(postJson("/auth/admin/login", Map.of("email", ADMIN_EMAIL,
                "password", "Sup3rSecret")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        return "Bearer " + r.get("tokens").get("accessToken").asText();
    }

    @Test
    void adminGrantsRestaurantRoleByEmail() throws Exception {
        String admin = adminToken();
        String owner = signUpAndVerify("owner.one@example.com");
        mvc.perform(post("/admin/restaurant-owners").header("Authorization", owner)
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"owner.one@example.com\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/admin/restaurant-owners").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"nobody@example.com\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/admin/restaurant-owners").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"Owner.One@example.com\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.userId").isNotEmpty());
        mvc.perform(get("/me").header("Authorization", owner))
                .andExpect(jsonPath("$.roles[?(@ == 'RESTAURANT')]").isNotEmpty());
    }

    @Test
    void flagsArePublicButOnlyAdminsCanListOrChangeThem() throws Exception {
        mvc.perform(get("/flags")).andExpect(status().isOk())
                .andExpect(jsonPath("$.guest_checkout").value(true))
                .andExpect(jsonPath("$.delivery_module").value(false));

        mvc.perform(get("/admin/flags")).andExpect(status().isUnauthorized());

        String customer = signUpAndVerify("flags.customer@example.com");
        mvc.perform(get("/me").header("Authorization", customer))
                .andExpect(jsonPath("$.roles[?(@ == 'ADMIN')]").isEmpty());
        mvc.perform(get("/admin/flags").header("Authorization", customer)).andExpect(status().isForbidden());
        mvc.perform(put("/admin/flags/guest_checkout").header("Authorization", customer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/flags")).andExpect(jsonPath("$.guest_checkout").value(true));
    }

    @Test
    void adminTogglesFlagsAndIdentityEnforcesTheirs() throws Exception {
        String admin = adminToken();
        mvc.perform(get("/me").header("Authorization", admin))
                .andExpect(jsonPath("$.roles[?(@ == 'ADMIN')]").isNotEmpty());
        mvc.perform(get("/admin/flags").header("Authorization", admin)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].key").exists());

        mvc.perform(put("/admin/flags/email_registration").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.updatedBy").exists());
        mvc.perform(get("/flags")).andExpect(jsonPath("$.email_registration").value(false));
        postJson("/auth/register", Map.of("name", "Late", "email", "late@example.com", "password", "Sup3rSecret",
                "consent", CONSENT)).andExpect(status().isServiceUnavailable());

        mvc.perform(put("/admin/flags/otp_login").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}")).andExpect(status().isOk());
        postJson("/auth/otp/request", Map.of("phone", "9811122233")).andExpect(status().isServiceUnavailable());

        mvc.perform(put("/admin/flags/does_not_exist").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}"))
                .andExpect(status().isNotFound());
        mvc.perform(put("/admin/flags/otp_login").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());

        for (String key : new String[] {"email_registration", "otp_login"}) {
            mvc.perform(put("/admin/flags/" + key).header("Authorization", admin)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}")).andExpect(status().isOk());
        }
        postJson("/auth/otp/request", Map.of("phone", "9811122233")).andExpect(status().isAccepted());
        assertEquals(true, mapper.readTree(mvc.perform(get("/flags")).andReturn().getResponse().getContentAsString())
                .get("otp_login").asBoolean());
    }

    @Test
    void partnerSignUpNeedsTheDeliveryFlagAndAVerifiedPhone() throws Exception {
        String admin = adminToken();
        String user = signUpAndVerify("partner.user@example.com");
        mvc.perform(post("/me/partner")).andExpect(status().isUnauthorized());
        mvc.perform(post("/me/partner").header("Authorization", user)).andExpect(status().isServiceUnavailable());

        mvc.perform(put("/admin/flags/delivery_module").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}")).andExpect(status().isOk());
        try {
            // no phone on an email account: must be refused
            mvc.perform(post("/me/partner").header("Authorization", user)).andExpect(status().isBadRequest());
        } finally {
            mvc.perform(put("/admin/flags/delivery_module").header("Authorization", admin)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
                    .andExpect(status().isOk());
        }
    }
}