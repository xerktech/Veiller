// Compatibility shim: the wire protocol moved to its own leaf package so
// phone-side consumers (@veiller/cloud-client, @veiller/engine) don't drag the
// server runtime's dependencies. Server code imports @veiller/cloud-protocol
// directly; this keeps the package's "./protocol" entry working.
export * from "@veiller/cloud-protocol"
