package com.veiller.recovery;

import static org.junit.Assert.assertTrue;

import com.veiller.recovery.util.RecoveryConstants;

import org.junit.Test;

public class BackupStoreTest {
  @Test
  public void backupPathIsStable() {
    assertTrue(RecoveryConstants.BACKUP_APK_PATH.endsWith("asg_client_backup.apk"));
    assertTrue(RecoveryConstants.BACKUP_METADATA_PATH.endsWith("asg_client_backup.json"));
  }
}
