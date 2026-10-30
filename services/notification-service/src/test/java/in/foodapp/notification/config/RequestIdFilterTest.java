package in.foodapp.notification.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestIdFilterTest {

    private final RequestIdFilter filter = new RequestIdFilter();

    /** Runs the filter and returns the id the request saw in the MDC; the response is filled in. */
    private String run(String incoming, MockHttpServletResponse response) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        if (incoming != null) {
            request.addHeader(RequestIdFilter.HEADER, incoming);
        }
        AtomicReference<String> seen = new AtomicReference<>();
        filter.doFilter(request, response, (req, res) -> seen.set(MDC.get(RequestIdFilter.MDC_KEY)));
        return seen.get();
    }

    @Test
    void generatesAnIdWhenTheCallerSendsNone() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        String seen = run(null, response);
        assertNotNull(seen);
        assertEquals(seen, response.getHeader(RequestIdFilter.HEADER));
        assertTrue(seen.matches("[0-9a-f-]{36}"));
    }

    @Test
    void keepsAWellFormedIncomingId() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        assertEquals("checkout-4f9c2a1e", run("checkout-4f9c2a1e", response));
        assertEquals("checkout-4f9c2a1e", response.getHeader(RequestIdFilter.HEADER));
    }

    @Test
    void replacesAMalformedIncomingIdSoItCannotInjectIntoLogs() throws Exception {
        for (String bad : new String[] {"short", "has space in it", "line\nbreak-injected", "x".repeat(65)}) {
            MockHttpServletResponse response = new MockHttpServletResponse();
            String seen = run(bad, response);
            assertNotEquals(bad, seen, bad);
            assertTrue(seen.matches("[0-9a-f-]{36}"), bad);
        }
    }

    @Test
    void clearsTheIdWhenTheRequestIsDone() throws Exception {
        run("checkout-4f9c2a1e", new MockHttpServletResponse());
        assertNull(MDC.get(RequestIdFilter.MDC_KEY));
    }
}
