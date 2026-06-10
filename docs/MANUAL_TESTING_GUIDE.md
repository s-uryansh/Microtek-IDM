# Microtek IDM Manual Testing Guide

## 1. Introduction

Microtek IDM is a warehouse inventory and dispatch management application for tracking products by serial number. It helps warehouse teams confirm that the physical serial numbers scanned in the warehouse match the stock movement documents used for receipt, dispatch, return, ageing, fulfilment, and exception correction.

The main problem it solves is serial mismatch. Instead of relying only on invoice or dispatch paperwork, the warehouse operator scans the actual product serial. IDM then shows whether the scanned serial is accepted, duplicated, invalid, excess, wrongly assigned, or needs supervisor correction.

### Warehouse Lifecycle Overview

The normal warehouse business flow is:

IDM-01 Production Import  
↓  
IDM-02 GRN (Goods Receipt)  
↓  
IDM-03 Battery Pre-Bill  
↓  
IDM-05 Dispatch  
↓  
IDM-04 SRN (Returns)  
↓  
IDM-07 Fulfilment  
↓  
IDM-08 Ageing  
↓  
IDM-09 Serial History  
↓  
IDM-10 Exceptions

In simple terms:

- Production Import brings serials into IDM from the source system.
- GRN receives stock into a warehouse.
- Battery Pre-Bill reserves battery serials before invoice processing.
- Dispatch ships stock to a customer.
- SRN receives stock returned by a customer.
- Fulfilment checks whether invoice quantities are completed.
- Ageing shows how long stock has been lying in warehouse.
- Serial History shows the full journey of one serial number.
- Exceptions allow supervisors to review and correct validation problems.

## 2. Application Access

Login URL: `http://localhost:5173`

Default credentials:

- Username: `admin`
- Password: `admin123`

### Login Instructions

1. Open a supported browser.
2. Go to `http://localhost:5173`.
3. Enter Username: `admin`.
4. Enter Password: `admin123`.
5. Click the login button.

Expected result: the Dashboard opens and the left sidebar displays Microtek IDM navigation.

## 3. Common Test Data

Use the lookup search where available because numeric IDs can vary between test environments. Search results display the current document, invoice, line, dispatch, or warehouse ID.

| Business Item | Search / Entry Value |
| --- | --- |
| GRN dispatch document | `MTK-DISPATCH-CW-01` |
| GRN valid serial | `MTK-INTRANSIT-0001` |
| GRN second valid serial | `MTK-INTRANSIT-0002` |
| GRN wrong-document serial | `MTK-INTRANSIT-RW02-0001` |
| GRN excess serial | `MTK-EXCESS-0001` |
| Dispatch invoice | `MTK-INVOICE-RW01-001` |
| Dispatch valid serial | `MTK-INV1K-0001` |
| Dispatch second valid serial | `MTK-INV1K-0002` |
| Battery invoice | `MTK-INVOICE-BATTERY-001` |
| Battery valid serial | `MTK-BAT100-0001` |
| Battery second valid serial | `MTK-BAT100-0002` |
| Return invoice | `MTK-INVOICE-RETURN-001` |
| Return serial | `DEMO-SRN-0001` |
| Serial history hero serial | `MTK-LIFECYCLE-0001` |
| Open exception serial | `MTK-INV1K-0002` |
| Invalid serial sample | `INVALID-SERIAL-9999` |
| Invalid numeric ID sample | `999999` |

Warehouse reference:

- `RW-01` usually appears as Warehouse ID `3` in a freshly seeded demo environment.
- `RW-02` usually appears as Warehouse ID `4`.
- If the displayed ID is different, use the ID shown in the lookup result.

Important UI note:

- SAP receipt scanning and Dispatch do not use CSV import/export in the current workflow.
- Test by typing/scanning one QR serial at a time in the scan input.
- SAP registry data is loaded by the backend SAP integration endpoint, not manually by warehouse operators.

## 4. Dashboard

After login, the tester should see:

- Left sidebar with Dashboard, Operations, Monitoring, and Administration sections.
- Operations: GRN, Dispatch, SRN, Battery Pre-Bill.
- Monitoring: Fulfilment, Ageing Report, Serial History, Exceptions.
- Administration: Import Monitor.
- Dashboard title: `Dashboard`.
- Subtitle: `Warehouse operations overview`.
- Inventory ageing cards or chart.
- Activity panel.
- Recent exceptions section.
- User area at bottom of sidebar with Logout button.

Screenshot checkpoint: capture the Dashboard after login showing the left sidebar and `Inventory Ageing Distribution`.

### TC-DASH-001 - Login And View Dashboard

Purpose:  
Confirm that a tester can log in and see the main warehouse overview.

Preconditions:  
Application is running at `http://localhost:5173`.

Test Steps:

1. Open `http://localhost:5173`.
2. Enter Username `admin`.
3. Enter Password `admin123`.
4. Click the login button.
5. Verify the Dashboard page opens.

Expected Result:  
Dashboard displays warehouse overview sections and the left navigation menu.

Pass Criteria:  
Tester can see `Dashboard`, `Inventory Ageing Distribution`, navigation menu, and Logout button.

### TC-DASH-002 - Logout

Purpose:  
Confirm that a tester can end the session.

Preconditions:  
Tester is logged in.

Test Steps:

1. Click `Logout` in the sidebar footer.
2. Wait for the screen to change.

Expected Result:  
The application returns to the login screen.

Pass Criteria:  
Protected pages are no longer visible after logout.

## 5. IDM-01 SAP Receipt Scan (Import Monitor)

Purpose:  
Import Monitor is used by warehouse staff to scan incoming product QR serials when stock physically arrives. The scan is validated against the SAP factory dispatch registry already imported into IDM by backend integration.

UI Location:  
Administration -> Import Monitor -> `Receipt Scan`

Main screen fields:

| Field | What to enter for testing |
| --- | --- |
| `Receiving Warehouse ID` | `3` for `RW-01` in a freshly seeded demo environment |
| `Scan QR Serial` | `MTK-INTRANSIT-0001` or `MTK-INTRANSIT-0002` |

Negative test data:

| Scenario | Receiving Warehouse ID | QR Serial |
| --- | ---: | --- |
| Wrong destination warehouse | `3` | `MTK-INTRANSIT-RW02-0001` |
| Unknown serial | `3` | `INVALID-SERIAL-9999` |

Screenshot checkpoint: capture the `SAP Receipt Scan` panel before scanning and after a successful scan result.

### TC-IMP-001 - Valid SAP Receipt Scan

Purpose:  
Confirm that an incoming product QR is validated against the original SAP factory dispatch and received into the selected warehouse.

Preconditions:  
Tester is logged in as `admin`.

Test Steps:

1. Open Administration -> `Import Monitor`.
2. Select `Receipt Scan` if it is not already selected.
3. In `Receiving Warehouse ID`, enter `3`.
4. In `Scan QR Serial`, enter `MTK-INTRANSIT-0001`.
5. Submit the scan.

Expected Result:  
The scan succeeds with `MATCHED` or a successful received message. The result shows the stock was received from the source warehouse into Warehouse ID `3`.

Pass Criteria:  
The serial is recorded as received, a GRN event is written, and the serial is now tied to the receiving warehouse.

### TC-IMP-002 - Second Valid SAP Receipt Scan

Purpose:  
Confirm that another serial from the same SAP dispatch can be received.

Preconditions:  
Tester is on Import Monitor -> `Receipt Scan`.

Test Steps:

1. In `Receiving Warehouse ID`, enter `3`.
2. In `Scan QR Serial`, enter `MTK-INTRANSIT-0002`.
3. Submit the scan.

Expected Result:  
The scan succeeds with `MATCHED` or a successful received message.

Pass Criteria:  
The second serial is recorded as received into Warehouse ID `3`.

### TC-IMP-003 - Wrong Warehouse Rejection

Purpose:  
Confirm that IDM blocks a serial whose SAP destination warehouse does not match the receiving warehouse entered by the operator.

Preconditions:  
Tester is on Import Monitor -> `Receipt Scan`.

Test Steps:

1. In `Receiving Warehouse ID`, enter `3`.
2. In `Scan QR Serial`, enter `MTK-INTRANSIT-RW02-0001`.
3. Submit the scan.

Expected Result:  
The scan is rejected with `WRONG_WAREHOUSE` or an equivalent wrong destination message.

Pass Criteria:  
The serial is not received into Warehouse ID `3`, and an exception is logged.

### TC-IMP-004 - Unknown Serial Rejection

Purpose:  
Confirm that a QR serial not found in the SAP dispatch registry is blocked.

Preconditions:  
Tester is on Import Monitor -> `Receipt Scan`.

Test Steps:

1. In `Receiving Warehouse ID`, enter `3`.
2. In `Scan QR Serial`, enter `INVALID-SERIAL-9999`.
3. Submit the scan.

Expected Result:  
The scan is rejected as not found or invalid.

Pass Criteria:  
The serial is not received and an exception is logged.

### TC-IMP-005 - Required Warehouse Field

Purpose:  
Confirm that receipt scanning cannot start without selecting the receiving warehouse.

Preconditions:  
Tester is on Import Monitor -> `Receipt Scan`.

Test Steps:

1. Leave `Receiving Warehouse ID` empty.
2. Try to enter `MTK-INTRANSIT-0001` in `Scan QR Serial`.

Expected Result:  
The scan input is disabled or the screen tells the tester to enter the receiving warehouse ID first.

Pass Criteria:  
No receipt is recorded until `Receiving Warehouse ID` is filled.

## 6. IDM-02 GRN (Goods Receipt Note)

Purpose:  
GRN is used when stock arrives at a warehouse. The operator searches the dispatch document, starts a receipt session, scans each incoming serial, and completes the session after the expected stock is verified.

UI Location:  
Operations -> GRN

Main screen sections:

- `Search Dispatch Document`
- `SAP Dispatch Document ID`
- `Receiving Warehouse ID`
- `Start GRN Session`
- `GRN Bulk Serial Fallback`
- `GRN` scan panel

Screenshot checkpoint: capture the `Start GRN Session` screen before starting and the `GRN #...` scan screen after starting.

### TC-GRN-001 - Start GRN Session

Purpose:  
Confirm that a tester can start receiving stock for a dispatch document.

Preconditions:  
Tester is logged in as `admin`.

Test Steps:

1. Open Operations -> `GRN`.
2. In `Search Dispatch Document`, enter `MTK-DISPATCH-CW-01`.
3. Select the returned document.
4. Verify `SAP Dispatch Document ID` is filled.
5. Verify `Receiving Warehouse ID` is filled. In a fresh demo environment this is usually `3`.
6. Click `Start GRN`.

Expected Result:  
The GRN scanning screen opens and displays `GRN #...`.

Pass Criteria:  
Tester can see the scan panel and the session is ready for serial entry.

### TC-GRN-002 - Valid Serial Scan

Purpose:  
Confirm that a correct incoming serial is accepted.

Preconditions:  
GRN session for `MTK-DISPATCH-CW-01` is open.

Test Steps:

1. In the GRN scan input, enter `MTK-INTRANSIT-0001`.
2. Submit the scan.
3. Observe the scan result message.

Expected Result:  
The serial is accepted with a successful receipt or matched message.

Pass Criteria:  
The result shows success and the scan count increases.

### TC-GRN-003 - Duplicate Serial Scan

Purpose:  
Confirm that the same serial cannot be received twice in the same GRN session.

Preconditions:  
`MTK-INTRANSIT-0001` has already been scanned successfully in the same GRN session.

Test Steps:

1. Enter `MTK-INTRANSIT-0001` again.
2. Submit the scan.
3. Observe the result message.

Expected Result:  
The application warns that the serial was already scanned for this GRN.

Pass Criteria:  
Duplicate scan is not counted as a new successful receipt.

### TC-GRN-004 - Wrong Serial

Purpose:  
Confirm that a serial belonging to another dispatch document is rejected or flagged.

Preconditions:  
GRN session for `MTK-DISPATCH-CW-01` is open.

Test Steps:

1. Enter `MTK-INTRANSIT-RW02-0001`.
2. Submit the scan.
3. Observe the result message.

Expected Result:  
The application displays a wrong serial or rejected message.

Pass Criteria:  
Serial is not treated as a clean matched receipt.

### TC-GRN-005 - Excess Serial

Purpose:  
Confirm that an unexpected serial is flagged as excess.

Preconditions:  
GRN session for `MTK-DISPATCH-CW-01` is open.

Test Steps:

1. Enter `MTK-EXCESS-0001`.
2. Submit the scan.
3. Observe the result message.

Expected Result:  
The application flags the serial as excess or rejected.

Pass Criteria:  
Unexpected serial does not pass as a normal matched receipt.

### TC-GRN-006 - Invalid Serial

Purpose:  
Confirm that an unknown serial is rejected.

Preconditions:  
GRN session is open.

Test Steps:

1. Enter `INVALID-SERIAL-9999`.
2. Submit the scan.

Expected Result:  
The application displays an error or rejection message.

Pass Criteria:  
Unknown serial is not accepted.

### TC-GRN-007 - Complete GRN Session

Purpose:  
Confirm that a GRN session can be completed after scanning.

Preconditions:  
GRN session is open and at least one serial has been scanned.

Test Steps:

1. Click the session completion button in the GRN scan panel.
2. Wait for the page to update.
3. Verify the session status changes to `CLOSED` or the completion control disappears.

Expected Result:  
GRN session is completed.

Pass Criteria:  
Completed GRN cannot continue as an active open session.

### TC-GRN-008 - Empty Input Negative Test

Purpose:  
Confirm that required GRN fields cannot be skipped.

Preconditions:  
Tester is on the `Start GRN Session` screen.

Test Steps:

1. Leave `SAP Dispatch Document ID` empty.
2. Leave `Receiving Warehouse ID` empty.
3. Observe the `Start GRN` button.

Expected Result:  
`Start GRN` remains disabled.

Pass Criteria:  
Tester cannot start a GRN without required information.

### TC-GRN-009 - Invalid ID Negative Test

Purpose:  
Confirm that a non-existing dispatch document cannot start a valid GRN.

Preconditions:  
Tester is on the `Start GRN Session` screen.

Test Steps:

1. Enter `999999` in `SAP Dispatch Document ID`.
2. Enter `3` in `Receiving Warehouse ID`.
3. Click `Start GRN`.

Expected Result:  
An error message appears.

Pass Criteria:  
No usable GRN scan session is created for the invalid document.

### TC-GRN-010 - Unauthorized Access Negative Test

Purpose:  
Confirm that GRN cannot be accessed without login.

Preconditions:  
Tester is logged out.

Test Steps:

1. Open `http://localhost:5173/grn` directly in the browser.

Expected Result:  
The login screen is shown.

Pass Criteria:  
GRN screen is not visible to a logged-out user.

### TC-GRN-011 - Validation Handshake (Gatekeeper)

Purpose:  
Confirm the Gatekeeper Validation Handshake blocks a serial that is unauthorized (not in the Master Validation Registry) or misdirected (destination warehouse does not match the SAP dispatch record). See Scope Section 3.2.

Preconditions:  
GRN session for `MTK-DISPATCH-CW-01` is open at the receiving warehouse (usually Warehouse ID `3`).

Test Steps:

1. Scan an **unauthorized serial** that does not exist in the Registry, for example `INVALID-SERIAL-9999`.
2. Submit the scan and observe the result.
3. Scan a **misdirected serial** — one that exists in the Registry but is dispatched to a different warehouse than the current GRN warehouse, for example `MTK-INTRANSIT-RW02-0001`.
4. Submit the scan and observe the result.
5. Open Monitoring -> `Exceptions` and refresh the open exceptions list.

Expected Result:  
Both scans are **blocked** (the receipt is not recorded). The unauthorized serial is rejected as not found; the misdirected serial is rejected as wrong warehouse. A corresponding exception is raised for each blocked scan.

Pass Criteria:  
Neither serial is received into stock, and an exception (NOT_FOUND / WRONG_WAREHOUSE or equivalent) is visible in the Exception Portal for the blocked scan.

## 7. IDM-05 Dispatch

Purpose:  
Dispatch is used when stock is shipped to a customer. The operator selects or enters the SAP invoice, confirms the dispatch warehouse, enters the quantity being dispatched in this session, scans physical product QR serials, and completes dispatch only after all selected quantity has been scanned.

UI Location:  
Operations -> Dispatch

Main screen sections:

- `Search Invoice`
- `Invoice ID`
- `Warehouse ID`
- `Dispatch Quantity`
- Current stock / remaining invoice quantity summary
- `Start Dispatch Session`
- `Dispatch` scan panel

There is no CSV import/export for Dispatch in the current workflow. Test by scanning or typing one serial at a time.

Field values for the standard demo test:

| Field | What to enter for testing |
| --- | --- |
| `Search Invoice` | `MTK-INVOICE-RW01-001` |
| `Invoice ID` | Use the numeric ID filled after selecting `MTK-INVOICE-RW01-001` |
| `Warehouse ID` | Use the ID filled after selecting the invoice; usually `3` for `RW-01` |
| `Dispatch Quantity` | `2` for a full demo dispatch, or `1` for partial dispatch testing |
| `Scan Serial` | `MTK-INV1K-0001`, then `MTK-INV1K-0002` |

Screenshot checkpoint: capture the start form showing invoice, warehouse, dispatch quantity, and current stock; then capture the `Dispatch #...` scan panel after starting.

### TC-DISP-001 - Start Dispatch Session

Purpose:  
Confirm that a dispatch session can be started from an invoice and selected quantity.

Preconditions:  
Tester is logged in as `admin`.

Test Steps:

1. Open Operations -> `Dispatch`.
2. In `Search Invoice`, enter `MTK-INVOICE-RW01-001`.
3. Select the returned invoice.
4. Verify `Invoice ID` is filled.
5. Verify `Warehouse ID` is filled. In a fresh demo environment this is usually `3`.
6. Verify current stock / remaining invoice quantity appears.
7. In `Dispatch Quantity`, enter `2`.
8. Click `Start Dispatch`.

Expected Result:  
The dispatch scanning screen opens and displays `Dispatch #...`.

Pass Criteria:  
Tester can see the dispatch scan panel. No invoice line field is required.

### TC-DISP-002 - Scan Panel Opens Without Invoice Line Entry

Purpose:  
Confirm that the operator does not need to enter or select an invoice line. IDM maps each scanned serial to the SAP invoice line by product.

Preconditions:  
Dispatch session for `MTK-INVOICE-RW01-001` is open.

Test Steps:

1. Confirm there is no `Invoice Line ID` input on the dispatch scan screen.
2. Confirm the `Scan Serial` input is enabled.

Expected Result:  
The scan panel is ready for physical QR serial scanning.

Pass Criteria:  
The tester can scan serials without manually choosing an invoice line.

### TC-DISP-003 - Valid Dispatch Scan

Purpose:  
Confirm that an in-stock serial can be dispatched.

Preconditions:  
Dispatch session is open with `Dispatch Quantity` set to `2`.

Test Steps:

1. Enter `MTK-INV1K-0001` in the dispatch scan input.
2. Submit the scan.

Expected Result:  
The scan succeeds and shows that the serial was dispatched.

Pass Criteria:  
The serial is accepted and mapped to the correct SAP invoice line internally.

### TC-DISP-004 - Duplicate Dispatch Scan

Purpose:  
Confirm that the same serial cannot be dispatched twice.

Preconditions:  
`MTK-INV1K-0001` was already scanned successfully in the same dispatch session.

Test Steps:

1. Enter `MTK-INV1K-0001` again.
2. Submit the scan.

Expected Result:  
The duplicate scan is rejected or flagged.

Pass Criteria:  
The duplicate serial does not increase successful dispatch quantity.

### TC-DISP-005 - Invalid Serial

Purpose:  
Confirm that an unknown serial is rejected during dispatch.

Preconditions:  
Dispatch session is open.

Test Steps:

1. Enter `INVALID-SERIAL-9999`.
2. Submit the scan.

Expected Result:  
Application shows a rejected or not found message.

Pass Criteria:  
Unknown serial is not dispatched.

### TC-DISP-006 - Product Mismatch Or Wrong Serial

Purpose:  
Confirm that a serial not suitable for the invoice is rejected.

Preconditions:  
Dispatch session is open for `MTK-INVOICE-RW01-001`.

Test Steps:

1. Enter `MTK-BAT100-0001`.
2. Submit the scan.

Expected Result:  
Application displays a mismatch or rejected message.

Pass Criteria:  
Battery serial is not accepted for the inverter invoice.

### TC-DISP-007 - Complete Dispatch

Purpose:  
Confirm that dispatch can be completed after the selected dispatch quantity is scanned.

Preconditions:  
Dispatch session is open with `Dispatch Quantity` set to `2`.

Test Steps:

1. Scan `MTK-INV1K-0001`.
2. Scan `MTK-INV1K-0002`.
3. Click the dispatch completion button.

Expected Result:  
Dispatch status changes to `DISPATCHED`.

Pass Criteria:  
The dispatch is completed only after the selected quantity is satisfied.

### TC-DISP-008 - Completion Edge Case

Purpose:  
Confirm that incomplete dispatch cannot be completed as fully dispatched.

Preconditions:  
Start a fresh dispatch session for an invoice that requires more than one serial.

Test Steps:

1. Search and select `MTK-INVOICE-RW01-001`.
2. Enter `Dispatch Quantity` as `2`.
3. Click `Start Dispatch`.
4. Scan only `MTK-INV1K-0001`.
5. Click the dispatch completion button.

Expected Result:  
Application blocks completion or shows the dispatch as incomplete.

Pass Criteria:  
The application does not mark a short dispatch as fully dispatched.

### TC-DISP-009 - Empty Input Negative Test

Purpose:  
Confirm dispatch cannot start without required fields.

Preconditions:  
Tester is on `Start Dispatch Session`.

Test Steps:

1. Leave `Invoice ID` empty.
2. Leave `Warehouse ID` empty.
3. Leave `Dispatch Quantity` empty.
4. Observe `Start Dispatch`.

Expected Result:  
`Start Dispatch` remains disabled.

Pass Criteria:  
Dispatch session cannot start with empty invoice, warehouse, or dispatch quantity fields.

### TC-DISP-010 - Unauthorized Access Negative Test

Purpose:  
Confirm Dispatch cannot be accessed without login.

Preconditions:  
Tester is logged out.

Test Steps:

1. Open `http://localhost:5173/dispatch` directly.

Expected Result:  
Login screen is displayed.

Pass Criteria:  
Dispatch page is not visible to logged-out users.

### TC-DISP-011 - Manual Entry Enforcement (Gatekeeper)

Purpose:  
Confirm that the dispatch scan panel remains locked until the operator manually confirms the Invoice ID, Warehouse ID, and dispatch quantity, and that the Invoice ID is never taken from a scanned product QR code.

Preconditions:  
Tester is logged in as `admin` and is on Operations -> `Dispatch`.

Test Steps:

1. On the `Start Dispatch Session` screen, leave `Invoice ID`, `Warehouse ID`, and `Dispatch Quantity` empty and confirm `Start Dispatch` is disabled.
2. Search and select `MTK-INVOICE-RW01-001`.
3. Confirm `Invoice ID` and `Warehouse ID` are filled.
4. In `Dispatch Quantity`, enter `1` or `2`.
5. Click `Start Dispatch`.
6. Confirm the scan panel opens only after these fields are complete.

Expected Result:  
The dispatch session cannot start without manually supplied invoice and warehouse context plus dispatch quantity. At no point is the Invoice ID populated from a scanned product serial/QR.

Pass Criteria:  
Scan input is available only after the operator manually starts a dispatch session with the required fields.

### TC-DISP-012 - Partial Batch Dispatch (Multi-Stage)

Purpose:  
Confirm an invoice can be dispatched in multiple sub-batches across separate sessions and tracks cumulative scanned quantity correctly.

Preconditions:  
A dispatch invoice whose quantity is greater than one is available. For the demo set, use `MTK-INVOICE-RW01-001` with `MTK-INV1K-0001` and `MTK-INV1K-0002`.

Test Steps:

1. Start a dispatch session for `MTK-INVOICE-RW01-001`.
2. In `Dispatch Quantity`, enter `1`.
3. Scan `MTK-INV1K-0001`.
4. Complete the first dispatch session.
5. Start or resume dispatch for the same invoice later.
6. In `Dispatch Quantity`, enter `1`.
7. Scan `MTK-INV1K-0002`.
8. Open Monitoring -> `Fulfilment`, search the invoice, and review Required vs. Scanned counts.
9. Complete dispatch once the full invoice quantity is scanned.

Expected Result:  
After the first sub-batch, the invoice remains incomplete or in progress for the remaining quantity. The remaining sub-batch can be scanned later against the same invoice. Fulfilment reflects the cumulative scanned quantity. Only after the total invoice quantity is scanned does the invoice advance to `Dispatched`.

Pass Criteria:  
Intermediate scanned quantities are tracked accurately, and the invoice is marked `Dispatched` only when complete.

## 8. IDM-04 SRN (Sales Return Note)

Purpose:  
SRN is used when a customer returns products. The operator searches the original invoice or dispatch, starts a return session, selects the condition of the returned product, and scans the returned serial.

UI Location:  
Operations -> SRN

Condition tags:

- `SALEABLE`: product can return to saleable stock.
- `DEFECTIVE`: product is damaged or failed validation.
- `REPAIR`: product requires repair handling.

Main screen sections:

- `Search Original Invoice`
- `Search Original Dispatch`
- `Receiving Warehouse ID`
- `Condition Tag`
- `Start Return Session`
- `SRN Bulk Return Fallback`
- `SRN` scan panel

Screenshot checkpoint: capture the condition tag dropdown and accepted return result.

### TC-SRN-001 - Start SRN Session

Purpose:  
Confirm that a return session can be started.

Preconditions:  
Tester is logged in as `admin`.

Test Steps:

1. Open Operations -> `SRN`.
2. In `Search Original Invoice`, enter `MTK-INVOICE-RETURN-001`.
3. Select the returned invoice.
4. Verify `Receiving Warehouse ID` is filled.
5. Select `SALEABLE` in `Condition Tag`.
6. Click `Start SRN`.

Expected Result:  
SRN scanning screen opens and displays `SRN #...`.

Pass Criteria:  
Tester can see condition tag selection and return scan input.

### TC-SRN-002 - SALEABLE Return Serial

Purpose:  
Confirm that a valid returned serial can be accepted as saleable.

Preconditions:  
SRN session is open.

Test Steps:

1. Select `SALEABLE` in `Condition Tag`.
2. Enter `DEMO-SRN-0001`.
3. Submit the scan.

Expected Result:  
Application shows `Return accepted (SALEABLE)` or an accepted result.

Pass Criteria:  
Returned serial is accepted with condition tag `SALEABLE`.

### TC-SRN-003 - DEFECTIVE Return Serial

Purpose:  
Confirm that a return can be tagged as defective.

Preconditions:  
A fresh SRN session is open and the serial has not already been returned in that session.

Test Steps:

1. Select `DEFECTIVE` in `Condition Tag`.
2. Enter a valid dispatched return serial provided for the test cycle.
3. Submit the scan.

Expected Result:  
Application accepts the return with condition tag `DEFECTIVE`.

Pass Criteria:  
Return result displays accepted status and the selected defective tag.

### TC-SRN-004 - REPAIR Return Serial

Purpose:  
Confirm that a return can be tagged for repair.

Preconditions:  
A fresh SRN session is open and a valid dispatched return serial is available.

Test Steps:

1. Select `REPAIR` in `Condition Tag`.
2. Enter the valid dispatched return serial provided for the test cycle.
3. Submit the scan.

Expected Result:  
Application accepts the return with condition tag `REPAIR`.

Pass Criteria:  
Return result displays accepted status and the selected repair tag.

### TC-SRN-005 - Duplicate Return Scan

Purpose:  
Confirm that the same returned serial cannot be accepted twice.

Preconditions:  
`DEMO-SRN-0001` has already been scanned in the SRN session.

Test Steps:

1. Enter `DEMO-SRN-0001` again.
2. Submit the scan.

Expected Result:  
Application rejects or flags the duplicate return.

Pass Criteria:  
Duplicate return is not accepted as a second return.

### TC-SRN-006 - Invalid Return Serial

Purpose:  
Confirm that an unknown serial cannot be returned.

Preconditions:  
SRN session is open.

Test Steps:

1. Enter `INVALID-SERIAL-9999`.
2. Submit the scan.

Expected Result:  
Application displays a rejected or not found message.

Pass Criteria:  
Unknown serial is not accepted.

### TC-SRN-007 - Non-Dispatched Serial Negative Test

Purpose:  
Confirm that a serial with no customer dispatch is not accepted as a customer return.

Preconditions:  
SRN session is open.

Test Steps:

1. Enter `MTK-INTRANSIT-0001`.
2. Submit the scan.

Expected Result:  
Application rejects the serial because it is not a valid customer return.

Pass Criteria:  
Serial is not accepted for SRN.

### TC-SRN-008 - Empty Input Negative Test

Purpose:  
Confirm SRN cannot start without warehouse information.

Preconditions:  
Tester is on `Start Return Session`.

Test Steps:

1. Clear `Receiving Warehouse ID`.
2. Observe `Start SRN`.

Expected Result:  
`Start SRN` remains disabled.

Pass Criteria:  
Return session cannot start without receiving warehouse.

### TC-SRN-009 - Unauthorized Access Negative Test

Purpose:  
Confirm SRN cannot be accessed without login.

Preconditions:  
Tester is logged out.

Test Steps:

1. Open `http://localhost:5173/srn` directly.

Expected Result:  
Login screen is displayed.

Pass Criteria:  
SRN page is not visible to logged-out users.

## 9. IDM-03 Battery Pre-Bill

Purpose:  
Battery Pre-Bill reserves battery serials before invoice processing. It ensures batteries are scanned and committed to an invoice line before billing can proceed.

UI Location:  
Operations -> Battery Pre-Bill

Main screen sections:

- `Search Battery Invoice`
- `Select Battery Line`
- `Invoice Line ID`
- `Battery Bulk Commit Fallback`
- `Battery commit scanning`
- `Check Commit Status`

Screenshot checkpoint: capture `Select Battery Line` and `Check Commit Status`.

### TC-BAT-001 - Select Battery Invoice Line

Purpose:  
Confirm that a battery invoice and battery line can be selected.

Preconditions:  
Tester is logged in as `admin`.

Test Steps:

1. Open Operations -> `Battery Pre-Bill`.
2. In `Search Battery Invoice`, enter `MTK-INVOICE-BATTERY-001`.
3. Select the returned invoice.
4. In `Select Battery Line`, click the battery line.
5. Verify `Invoice Line ID` is filled.

Expected Result:  
Battery scan input becomes enabled.

Pass Criteria:  
Tester can scan or enter battery serials.

### TC-BAT-002 - Commit Valid Battery Serial

Purpose:  
Confirm that a valid battery serial can be committed.

Preconditions:  
Battery invoice line is selected.

Test Steps:

1. Enter `MTK-BAT100-0001` in the battery scan input.
2. Submit the scan.

Expected Result:  
Application shows `Battery serial committed` or accepted status.

Pass Criteria:  
Battery serial is committed to the invoice line.

### TC-BAT-003 - Duplicate Battery Commit

Purpose:  
Confirm that the same battery serial cannot be committed twice.

Preconditions:  
`MTK-BAT100-0001` was already committed.

Test Steps:

1. Enter `MTK-BAT100-0001` again.
2. Submit the scan.

Expected Result:  
Application rejects or flags the duplicate commit.

Pass Criteria:  
Duplicate commit does not increase committed quantity.

### TC-BAT-004 - Non-Battery Serial Negative Test

Purpose:  
Confirm that a non-battery serial cannot be committed to a battery invoice line.

Preconditions:  
Battery invoice line is selected.

Test Steps:

1. Enter `MTK-INV1K-0001`.
2. Submit the scan.

Expected Result:  
Application rejects the serial.

Pass Criteria:  
Non-battery serial is not committed.

### TC-BAT-005 - Check Commit Status

Purpose:  
Confirm that the tester can view committed quantity for a battery invoice.

Preconditions:  
Battery invoice was selected from lookup.

Test Steps:

1. In `Check Commit Status`, verify `Invoice ID` is filled.
2. Click `Check Status`.
3. Review committed quantity.

Expected Result:  
Application displays invoice number and number of serials committed.

Pass Criteria:  
Committed quantity matches successful battery scans completed by the tester.

### TC-BAT-006 - Empty Input Negative Test

Purpose:  
Confirm scan is blocked when invoice line is missing.

Preconditions:  
Tester is on Battery Pre-Bill page.

Test Steps:

1. Clear `Invoice Line ID`.
2. Observe the battery scan panel.

Expected Result:  
Scan panel shows that an invoice line is required.

Pass Criteria:  
Tester cannot commit serial without invoice line context.

### TC-BAT-007 - Invalid Invoice ID Negative Test

Purpose:  
Confirm commit status search handles invalid invoice ID.

Preconditions:  
Tester is on Battery Pre-Bill page.

Test Steps:

1. In `Invoice ID`, enter `999999`.
2. Click `Check Status`.

Expected Result:  
Application shows an error or no status for the invalid invoice.

Pass Criteria:  
Invalid invoice does not return a successful commit status.

### TC-BAT-008 - Unauthorized Access Negative Test

Purpose:  
Confirm Battery Pre-Bill cannot be accessed without login.

Preconditions:  
Tester is logged out.

Test Steps:

1. Open `http://localhost:5173/battery` directly.

Expected Result:  
Login screen is displayed.

Pass Criteria:  
Battery Pre-Bill page is not visible to logged-out users.

## 10. IDM-07 Fulfilment

Purpose:  
Fulfilment is used to check whether an invoice is pending, partially fulfilled, or completed. Warehouse supervisors use it to verify how many serials are required, scanned, and committed.

UI Location:  
Monitoring -> Fulfilment

Main screen sections:

- `Order Lookup`
- `Invoice ID`
- `Search`
- `Invoice scanner`
- `Fulfilment CSV`
- Required, Scanned, and Committed quantities

Screenshot checkpoint: capture fulfilment status showing Required, Scanned, and Committed counts.

### TC-FUL-001 - Search Fulfilment By Invoice

Purpose:  
Confirm that fulfilment status can be viewed for an invoice.

Preconditions:  
Tester is logged in as `admin`.

Test Steps:

1. Open Monitoring -> `Fulfilment`.
2. Enter the current numeric Invoice ID for `MTK-INVOICE-RW01-001`. Use Dispatch lookup first if the numeric ID is unknown.
3. Click `Search`.

Expected Result:  
Application displays invoice status and quantity counts.

Pass Criteria:  
Tester can see `Required`, `Scanned`, and `Committed`.

### TC-FUL-002 - Scan Or Enter Invoice ID

Purpose:  
Confirm that fulfilment can be loaded through the scanner panel.

Preconditions:  
Tester knows a valid numeric invoice ID.

Test Steps:

1. In `Invoice scanner`, enter the valid invoice ID.
2. Submit the scan.

Expected Result:  
Fulfilment status loads successfully.

Pass Criteria:  
Scanner panel shows success and the status card updates.

### TC-FUL-003 - Invalid Invoice ID

Purpose:  
Confirm invalid invoice IDs are handled.

Preconditions:  
Tester is on Fulfilment page.

Test Steps:

1. Enter `999999` in `Invoice ID`.
2. Click `Search`.

Expected Result:  
Application displays `No fulfilment data found for this invoice` or an error.

Pass Criteria:  
Invalid invoice does not show a valid fulfilment card.

### TC-FUL-004 - Empty Input Negative Test

Purpose:  
Confirm Search cannot run with empty invoice input.

Preconditions:  
Tester is on Fulfilment page.

Test Steps:

1. Clear `Invoice ID`.
2. Observe `Search`.

Expected Result:  
`Search` remains disabled.

Pass Criteria:  
Tester cannot search with empty invoice input.

### TC-FUL-005 - Unauthorized Access Negative Test

Purpose:  
Confirm Fulfilment cannot be accessed without login.

Preconditions:  
Tester is logged out.

Test Steps:

1. Open `http://localhost:5173/fulfilment` directly.

Expected Result:  
Login screen is displayed.

Pass Criteria:  
Fulfilment page is not visible to logged-out users.

## 11. IDM-08 Ageing Report

Purpose:  
Ageing Report shows how long in-stock serials have remained in a warehouse. This helps warehouse teams identify slow-moving stock and missing receipt-date data.

UI Location:  
Monitoring -> Ageing Report

Ageing buckets usually represent stock grouped by age, such as recently received, older stock, and missing receipt date. A higher-age bucket means the stock has been lying in inventory longer.

Main screen sections:

- `Warehouse ID`
- `Ageing Report Export`
- `Variance Report Export`
- `Ageing Distribution`
- `Bucket Details`

Screenshot checkpoint: capture `Ageing Distribution` and `Bucket Details` for Warehouse ID `3`.

### TC-AGE-001 - Load Ageing Report

Purpose:  
Confirm that ageing report loads for a warehouse.

Preconditions:  
Tester is logged in as `admin`.

Test Steps:

1. Open Monitoring -> `Ageing Report`.
2. In `Warehouse ID`, enter `3`.
3. Wait for the report to load.

Expected Result:  
Ageing chart and bucket table display data or a valid empty report.

Pass Criteria:  
Tester can see `Ageing Distribution` and `Bucket Details`.

### TC-AGE-002 - Missing Receipt Date Warning

Purpose:  
Confirm the page warns when stock has missing receipt dates.

Preconditions:  
Warehouse with missing receipt dates is available. In seeded demo data, try Warehouse ID `4`.

Test Steps:

1. Open Monitoring -> `Ageing Report`.
2. Enter `4` in `Warehouse ID`.
3. Watch for any warning message above the report.

Expected Result:  
If missing receipt dates exist, warning message is displayed.

Pass Criteria:  
Tester can identify missing receipt-date data when present.

### TC-AGE-003 - Invalid Warehouse ID

Purpose:  
Confirm invalid warehouse input does not crash the page.

Preconditions:  
Tester is on Ageing Report page.

Test Steps:

1. Enter `999999` in `Warehouse ID`.
2. Wait for the page response.

Expected Result:  
Application shows an empty report or an error state.

Pass Criteria:  
Page remains usable and does not display unrelated warehouse data.

### TC-AGE-004 - Empty Warehouse Input

Purpose:  
Confirm the page asks for warehouse input.

Preconditions:  
Tester is on Ageing Report page.

Test Steps:

1. Clear `Warehouse ID`.

Expected Result:  
Page displays `Enter a warehouse ID to load the ageing report`.

Pass Criteria:  
No report loads without warehouse input.

### TC-AGE-005 - Unauthorized Access Negative Test

Purpose:  
Confirm Ageing Report cannot be accessed without login.

Preconditions:  
Tester is logged out.

Test Steps:

1. Open `http://localhost:5173/ageing` directly.

Expected Result:  
Login screen is displayed.

Pass Criteria:  
Ageing Report page is not visible to logged-out users.

## 12. IDM-09 Serial History

Purpose:  
Serial History is used to track the complete lifecycle of a serial. It helps a warehouse supervisor answer where the serial came from, where it moved, whether it was dispatched, returned, or involved in an exception.

UI Location:  
Monitoring -> Serial History

Timeline event examples:

- `PRODUCTION`: serial was created/imported into tracking.
- `GRN`: serial was received into warehouse.
- `CUSTOMER_DISPATCH`: serial was shipped to customer.
- `SRN`: serial was returned by customer.
- `EXCEPTION`: serial had a validation issue.
- `CORRECTION`: exception or serial issue was corrected.

Main screen sections:

- `Serial Lookup`
- `Serial Number`
- `Search`
- `Serial scanner`
- `Serial History CSV`
- `Serial Timeline Export`
- Current Status
- Timeline cards

Screenshot checkpoint: capture the timeline for `MTK-LIFECYCLE-0001`.

### TC-HIST-001 - Search Serial History

Purpose:  
Confirm that a serial timeline can be viewed.

Preconditions:  
Tester is logged in as `admin`.

Test Steps:

1. Open Monitoring -> `Serial History`.
2. In `Serial Number`, enter `MTK-LIFECYCLE-0001`.
3. Click `Search`.

Expected Result:  
The page displays `Serial: MTK-LIFECYCLE-0001`, current status, and timeline entries.

Pass Criteria:  
Tester can see at least one lifecycle event for the serial.

### TC-HIST-002 - Scan Serial History

Purpose:  
Confirm serial lookup works from the scanner panel.

Preconditions:  
Tester is on Serial History page.

Test Steps:

1. In `Serial scanner`, enter `MTK-LIFECYCLE-0001`.
2. Submit the scan.

Expected Result:  
Scanner shows success and timeline loads.

Pass Criteria:  
Serial timeline is displayed.

### TC-HIST-003 - Serial Not Found

Purpose:  
Confirm unknown serials are handled clearly.

Preconditions:  
Tester is on Serial History page.

Test Steps:

1. Enter `INVALID-SERIAL-9999` in `Serial Number`.
2. Click `Search`.

Expected Result:  
Page displays `Not Found` and states that the serial was not found.

Pass Criteria:  
No false timeline is shown for the invalid serial.

### TC-HIST-004 - Empty Input Negative Test

Purpose:  
Confirm Search cannot run with empty serial input.

Preconditions:  
Tester is on Serial History page.

Test Steps:

1. Clear `Serial Number`.
2. Observe `Search`.

Expected Result:  
`Search` remains disabled.

Pass Criteria:  
Tester cannot search without a serial number.

### TC-HIST-005 - Unauthorized Access Negative Test

Purpose:  
Confirm Serial History cannot be accessed without login.

Preconditions:  
Tester is logged out.

Test Steps:

1. Open `http://localhost:5173/serials` directly.

Expected Result:  
Login screen is displayed.

Pass Criteria:  
Serial History page is not visible to logged-out users.

## 13. IDM-10 Exceptions

Purpose:  
Exceptions are used to review and correct validation problems such as wrong serial, product mismatch, duplicate scan, invalid status, or other warehouse workflow issues. Supervisors use this screen to decide whether an exception should be corrected.

UI Location:  
Monitoring -> Exceptions

Main screen sections:

- `Exception Portal`
- Status filter: All Statuses, Open, Corrected, Dismissed
- `Exception List`
- `Exception ID`
- `Load Exception`
- `Exception scanner`
- Exception detail panel
- `Correction Reason (required)`
- `Correct Exception`

Screenshot checkpoint: capture one open exception before correction and the same exception after correction.

### TC-EXC-001 - View Open Exceptions

Purpose:  
Confirm that open exceptions can be listed.

Preconditions:  
Tester is logged in as `admin`.

Test Steps:

1. Open Monitoring -> `Exceptions`.
2. In the status filter, select `Open`.
3. Click `Refresh`.
4. Review the table.

Expected Result:  
Open exceptions are listed with ID, Serial No, Rule, Context, Status, and Raised At.

Pass Criteria:  
At least one open exception is visible, or a valid empty list is displayed without page error.

### TC-EXC-002 - Load Exception Detail From Table

Purpose:  
Confirm that a tester can review exception details.

Preconditions:  
Exception list is visible.

Test Steps:

1. Click an exception row in the table.
2. Review the right-side detail panel.

Expected Result:  
Detail panel displays exception number, serial, rule, context, status, raised time, and raised by.

Pass Criteria:  
Selected exception details match the clicked row.

### TC-EXC-003 - Load Exception By ID

Purpose:  
Confirm that an exception can be opened by ID.

Preconditions:  
Tester knows an exception ID from the table.

Test Steps:

1. Enter the exception ID in `Exception ID`.
2. Click `Load Exception`.

Expected Result:  
The selected exception detail panel opens.

Pass Criteria:  
Correct exception number and details are displayed.

### TC-EXC-004 - Correct Open Exception

Purpose:  
Confirm that an open exception can be corrected with a reason.

Preconditions:  
An open exception is loaded and shows `Status: OPEN`.

Test Steps:

1. In `Correction Reason (required)`, enter `Manual QA correction after warehouse verification`.
2. Click `Correct Exception`.
3. Wait for the detail panel to refresh.

Expected Result:  
Exception status changes from `OPEN` to `CORRECTED`, and corrected information is shown.

Pass Criteria:  
Corrected status and correction reason are visible.

### TC-EXC-005 - View Corrected Exception

Purpose:  
Confirm corrected exceptions are visible after correction.

Preconditions:  
At least one exception has been corrected.

Test Steps:

1. Select `Corrected` in the status filter.
2. Click `Refresh`.
3. Open the corrected exception.

Expected Result:  
Corrected exception shows corrected time, corrected by, and reason.

Pass Criteria:  
Corrected exception can be reviewed and is not shown as open.

### TC-EXC-006 - Invalid Correction Attempt

Purpose:  
Confirm that correction cannot be saved without a reason.

Preconditions:  
An open exception is loaded.

Test Steps:

1. Leave `Correction Reason (required)` empty.
2. Observe `Correct Exception`.

Expected Result:  
`Correct Exception` remains disabled.

Pass Criteria:  
Tester cannot correct an exception without a reason.

### TC-EXC-007 - Invalid Exception ID

Purpose:  
Confirm invalid exception ID is handled.

Preconditions:  
Tester is on Exceptions page.

Test Steps:

1. Enter `999999` in `Exception ID`.
2. Click `Load Exception`.

Expected Result:  
Application displays a detail load error or no exception found.

Pass Criteria:  
Invalid ID does not load unrelated exception details.

### TC-EXC-008 - Empty Exception ID Negative Test

Purpose:  
Confirm exception detail cannot be loaded with empty ID.

Preconditions:  
Tester is on Exceptions page.

Test Steps:

1. Clear `Exception ID`.
2. Observe `Load Exception`.

Expected Result:  
`Load Exception` remains disabled.

Pass Criteria:  
Tester cannot load exception detail with empty ID.

### TC-EXC-009 - Unauthorized Access Negative Test

Purpose:  
Confirm Exceptions cannot be accessed without login.

Preconditions:  
Tester is logged out.

Test Steps:

1. Open `http://localhost:5173/exceptions` directly.

Expected Result:  
Login screen is displayed.

Pass Criteria:  
Exceptions page is not visible to logged-out users.

## 14. Cross-Module Negative Test Checklist

Run these checks for each module where the field or action exists:

| Negative Scenario | Tester Action | Expected Result |
| --- | --- | --- |
| Empty input | Clear required fields | Button disabled or validation message shown |
| Invalid ID | Enter `999999` | Error, no result, or no session created |
| Invalid serial | Enter `INVALID-SERIAL-9999` | Serial rejected or not found |
| Duplicate serial | Scan same accepted serial twice | Second scan rejected or flagged |
| Unauthorized action | Logout and open page URL directly | Login screen appears |
| Completion edge case | Try to complete before required scans | Completion blocked or incomplete status shown |
| Wrong product | Scan battery serial for inverter invoice or inverter serial for battery invoice | Product mismatch or rejected result |
| Wrong workflow status | Use a serial that belongs to another workflow stage | Rejected or exception result |

## 15. Test Execution Notes

For each manual test run, record:

- Test case ID.
- Tester name.
- Date and time.
- Browser and version.
- Test environment URL.
- Test data used.
- Actual result.
- Pass or Fail.
- Screenshot reference.
- Defect ID if failed.

Recommended screenshot names:

- `TC-GRN-001-start-grn.png`
- `TC-DISP-003-valid-dispatch-scan.png`
- `TC-SRN-002-saleable-return.png`
- `TC-BAT-005-commit-status.png`
- `TC-FUL-001-status.png`
- `TC-AGE-001-buckets.png`
- `TC-HIST-001-timeline.png`
- `TC-EXC-004-corrected-exception.png`

## 16. Defect Reporting Template

Use this format when raising a defect:

Defect Title:  
Short description of the issue.

Module:  
Example: IDM-02 GRN.

Test Case ID:  
Example: TC-GRN-003.

Steps to Reproduce:

1. Step one.
2. Step two.
3. Step three.

Expected Result:  
What should have happened.

Actual Result:  
What actually happened.

Test Data Used:  
Example: `MTK-INTRANSIT-0001`.

Screenshot / Video:  
Attach file name or link.

Severity:

- Critical: workflow blocked or wrong stock movement accepted.
- High: incorrect validation result or incorrect status.
- Medium: confusing error, missing message, export issue.
- Low: layout, spelling, or cosmetic issue.

## 17. Final Acceptance Checklist

Before marking manual testing complete:

- Dashboard opens after login.
- GRN supports valid, duplicate, wrong, excess, invalid, and complete-session scenarios.
- Dispatch supports invoice search, warehouse confirmation, dispatch quantity selection, valid scan, invalid scan, duplicate scan, and completion checks.
- SRN supports SALEABLE, DEFECTIVE, and REPAIR condition workflows.
- Battery Pre-Bill commits only valid battery serials and shows commit status.
- Fulfilment shows required, scanned, and committed quantities.
- Ageing Report loads bucket details by warehouse.
- Serial History displays timeline for `MTK-LIFECYCLE-0001`.
- Exceptions can be viewed, filtered, loaded, and corrected with a reason.
- SAP receipt scanning and Dispatch are tested through physical QR/serial scan entry only; no CSV import/export is part of those workflows.
- Logged-out users cannot access protected pages directly.

### Mandatory Gatekeeper Verification Points

These three checks are mandatory before manual testing is signed off:

- **Validation Handshake (TC-GRN-011):** GRN blocks any unauthorized or misdirected serial (not in the Master Validation Registry, or destination warehouse mismatch) and raises an exception instead of receiving it.
- **Manual Entry Enforcement (TC-DISP-011):** The dispatch scan panel stays locked until the operator manually confirms the Invoice ID; the Invoice ID is never derived from a scanned product QR code.
- **Partial Batch Dispatch (TC-DISP-012):** Large orders can be dispatched in multiple sub-batches across sessions, persist as `Partially Dispatched` until the full quantity is reached, and are tracked correctly for ageing and audit.
