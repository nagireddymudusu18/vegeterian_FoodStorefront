package in.foodapp.identity.persistence;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AdminLoginCodeRepository extends JpaRepository<AdminLoginCode, UUID> {

    /** Row lock so concurrent guesses can't race the attempt counter. */
    @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from AdminLoginCode c where c.id = :id")
    Optional<AdminLoginCode> lockById(@Param("id") UUID id);

    @Modifying(clearAutomatically = true)
    @Query("update AdminLoginCode c set c.usedAt = :now where c.id = :id and c.usedAt is null "
            + "and c.expiresAt > :now")
    int consume(@Param("id") UUID id, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Query("update AdminLoginCode c set c.usedAt = :now where c.userId = :userId and c.usedAt is null")
    int invalidateAll(@Param("userId") UUID userId, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Query("delete from AdminLoginCode c where c.expiresAt < :before")
    int deleteExpiredBefore(@Param("before") Instant before);
}
