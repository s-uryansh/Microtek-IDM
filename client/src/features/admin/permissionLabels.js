// Human-readable names and descriptions for RBAC permission codes, so the Roles
// editor reads in plain language instead of developer strings. The description
// is surfaced on hover. Unknown codes fall back to a derived Title Case label.
export const PERMISSION_LABELS = {
  "foundation:read": {
    label: "View reference data",
    description: "Read warehouses, products and other base configuration."
  },
  "integration:import": {
    label: "Import SAP data",
    description: "Ingest production and factory-dispatch data from SAP into IDM."
  },
  "serial:validate": {
    label: "Validate serials",
    description: "Run real-time serial validation checks while scanning."
  },
  "dispatch:write": {
    label: "Dispatch goods",
    description: "Scan serials and dispatch stock against an invoice."
  },
  "grn:write": {
    label: "Receive goods (GRN)",
    description: "Scan serials to receive inbound stock into a warehouse."
  },
  "srn:write": {
    label: "Process returns (SRN)",
    description: "Scan and record customer returns."
  },
  "fulfilment:read": {
    label: "View fulfilment status",
    description: "See how far each invoice has progressed toward full dispatch."
  },
  "ageing:read": {
    label: "View ageing reports",
    description: "See inventory ageing buckets and reports."
  },
  "reconciliation:read": {
    label: "View reconciliation",
    description: "See stock reconciliation between IDM and recorded movements."
  },
  "serial-history:read": {
    label: "View serial history",
    description: "See the full transaction history of any serial number."
  },
  "exception:read": {
    label: "View exceptions",
    description: "See exceptions raised during scanning and validation."
  },
  "exception:correct": {
    label: "Correct exceptions",
    description: "Post corrective transactions, with a reason, to resolve exceptions."
  },
  "condition:correct": {
    label: "Correct condition tags",
    description: "Clear DEFECTIVE / REPAIR holds by retagging returned stock as saleable so it can be dispatched again."
  },
  "battery:write": {
    label: "Battery pre-billing",
    description: "Commit battery serials before billing."
  },
  "battery:read": {
    label: "View battery pre-billing",
    description: "See battery pre-billing commitments."
  },
  "invoice:read": {
    label: "View invoices",
    description: "Browse invoices and their line items."
  },
  "invoice:export": {
    label: "Export invoices",
    description: "Download invoice data as CSV."
  },
  "admin:access": {
    label: "Administration",
    description: "Manage warehouses, members, roles, products and stock."
  }
};

function titleCaseFromCode(code) {
  return String(code)
    .replace(/[:_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function describePermission(code) {
  return (
    PERMISSION_LABELS[code] ?? {
      label: titleCaseFromCode(code),
      description: `Permission: ${code}`
    }
  );
}
