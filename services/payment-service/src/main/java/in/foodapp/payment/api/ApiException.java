package in.foodapp.payment.api;

import org.springframework.http.HttpStatus;

/** Business/HTTP error rendered as RFC 7807 problem+json by {@link ApiExceptionHandler}. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String title;

    public ApiException(HttpStatus status, String title, String detail) {
        super(detail);
        this.status = status;
        this.title = title;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getTitle() {
        return title;
    }
}
