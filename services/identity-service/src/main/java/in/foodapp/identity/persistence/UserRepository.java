package in.foodapp.identity.persistence;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByPhoneHash(String phoneHash);

    Optional<User> findByEmailHash(String emailHash);

    /** Accounts that were explicitly given ADMIN (the main admin comes from configuration, not this column). */
    @org.springframework.data.jpa.repository.Query(
            value = "select * from users where 'ADMIN' = any(roles) and status = 'ACTIVE' order by created_at",
            nativeQuery = true)
    java.util.List<User> findStoredAdmins();

    /** Row lock so concurrent failed logins can't race the lockout counter. */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select u from User u where u.emailHash = :hash")
    Optional<User> lockByEmailHash(@org.springframework.data.repository.query.Param("hash") String hash);
}
