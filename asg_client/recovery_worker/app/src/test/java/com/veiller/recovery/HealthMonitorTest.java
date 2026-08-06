package com.veiller.recovery;

import static org.junit.Assert.assertTrue;

import com.veiller.recovery.util.RecoveryConstants;

import org.junit.Test;

public class HealthMonitorTest {
  @Test
  public void pingPongActionsAreNamespaced() {
    assertTrue(RecoveryConstants.ACTION_PING.startsWith("com.veiller.recovery."));
    assertTrue(RecoveryConstants.ACTION_PONG.startsWith("com.veiller.recovery."));
  }
}
