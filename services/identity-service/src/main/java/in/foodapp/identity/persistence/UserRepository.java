package in.foodapp.identity.persistence;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByPhoneHash(String phoneHash);

    Optional<User> findByEmailHash(String emailHash);

    /** Row lock so concurrent failed logins can't race the lockout counter. */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select u from User u where u.emailHash = :hash")
    Optional<User> lockByEmailHash(@org.springframework.data.repository.query.Param("hash") String hash);
}
