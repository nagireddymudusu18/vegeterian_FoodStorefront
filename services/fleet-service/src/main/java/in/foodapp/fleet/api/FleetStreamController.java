package in.foodapp.fleet.api;

import in.foodapp.fleet.events.stream.FleetStreamHub;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Live "something changed" streams for the partner app (PARTNER) and the admin screen (ADMIN). */
@RestController
@RequestMapping("/fleet")
public class FleetStreamController {

    private final FleetStreamHub hub;

    public FleetStreamController(FleetStreamHub hub) {
        this.hub = hub;
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter partnerStream() {
        return open();
    }

    @GetMapping(value = "/admin/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter adminStream() {
        return open();
    }

    private SseEmitter open() {
        return hub.open().orElseThrow(() -> new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many streams",
                "Too many open connections"));
    }
}