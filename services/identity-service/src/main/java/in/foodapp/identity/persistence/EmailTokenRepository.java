package in.foodapp.identity.persistence;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EmailTokenRepository extends JpaRepository<EmailToken, UUID> {

    /** Atomic single-use: only one concurrent caller can flip used_at. */
    @Modifying(clearAutomatically = true)
    @Query("update EmailToken t set t.usedAt = :now where t.tokenHash = :hash and t.purpose = :purpose "
            + "and t.usedAt is null and t.expiresAt > :now")
    int consume(@Param("hash") String hash, @Param("purpose") String purpose, @Param("now") Instant now);

    @Query("select t.userId from EmailToken t where t.tokenHash = :hash")
    Optional<UUID> findUserIdByHash(@Param("hash") String hash);

    @Modifying(clearAutomatically = true)
    @Query("update EmailToken t set t.usedAt = :now where t.userId = :userId and t.purpose = :purpose "
            + "and t.usedAt is null")
    int invalidateAll(@Param("userId") UUID userId, @Param("purpose") String purpose, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Query("delete from EmailToken t where t.expiresAt < :before")
    int deleteExpiredBefore(@Param("before") Instant before);
}
