# Microtek-IDM

All the modules visible or accessible are premission based by the admin.

For this documentation everything explained considering user has all the permissions except admin.

---

### Login

After logging a dashbaord is visbile which show the stats of the current warehouse i.e. if the user/worker/staff is from warehouse RW-02 he can only see the stats for that warehouse.

---

### Import Production

This is the first requirement.
By default it works after the integration of this IDM with SAP. It takes the production data coming from SAP and validates if they are actually the good exported by SAP.

```Flow:
- SAP provides a Payload -> We mark it Imported & In transit
- If there is any duplicate serial in the payload it is dropped
  - This is done by a set that is implemented in the backend.
```

`Manual Testing`:
```
- Enter the Batch reference number for the batch you are importing manually.
- Import everything via a CSV file
- Downloadable CSV template available.
```

`# This is specially designed for Admin > for STAF GRN exist`

---
### Goods Receipt Notes (GRN)


Physical implementation of the IDM-01 for staff. Staff doesn't have to enter or choose the warehouse it is fetched from the warehouse they are assigned.

```Flow:
- Worker opens GRN section -> Starts the session.
- Enter teh Dispatch ID/Doc.
  - All the items to be imported are shown.
- Enter the serial number of products to be imported backend make the following comparision:
  - Is the serial number is correct format?
  - Was it produced by the SAP?
  - Is it the correct product to import?
- Once all the comes true the import is accepted.
- If any of this fails import of that is rejected and an exception is created.
```

`Manual Testing (Seeded Data)`:
```
- Enter the Dispatch ID: MTK-DISPATCH-CW-01
- Scan the serail in that dispatch
    - MTK-INTRANSIT-0001
    - MTK-INTRANSIT-0002
- Complete the session:
    - All the stock is counted in the correct warehouse.
    - Marked IN_STOCK on masters panel.
```
`# Any thing done outside this flow will create an exception`

---

### Battery Pre-Billing

As written in the requirements batteries must be pre-billed before they can be scanned for the dispatch.

`Currently there is no bill generation`

```
Flow:
- Enter the Invoice ID which consist the battery that is needed to pre-bill.
- Scan/Enter the serial number of the battery
- Battery pre-billing done ready to dispatch
```

`Manual Testing (Seeded Data)`:
```
- Enter the Invoice ID: 2
- Scan the serial of the battery:
    - EB100-0001
    - EB100-0002
- Done:
    - The Battery is ready to be dispatched now.
```
`# Any thing done outside this flow will create an exception`

---

### Dispatch

Dispatching the batch to the customer.
Worker scan each serial if the serial belongs the the product type it is successful else exception is raise.
- If Battery is present in the invoice the battery must be pre-billed.
- Product should not have the status defective or repairable.
- if the warehouse contains sufficient stock partial dispatch is not allowed
- If sufficient stock is not present partial dispatch is allowed

```
Flow:
- Enter the Invoice ID which is to be dispatched.
    - This will reveal all the item in that invoice, qty needed to be dispatched.
    - (If partial dispatch was done) partial invoice can be dispatched again when the stock arrives.
- Start the dispatch:
    - Enter the serial number of the product to dispatch.
    - Complete the session.

```

`Manual Testing (Seeded Data)`:
```
- Enter the Invoice ID: 2
- Scan the serial of the product:
    - EB100-0001.
    - EB100-0002.
(Both of them must be pre-scanned first.)
- Done.
```

`# Any thing done outside this flow will create an exception`

---

### Fulfilment

Showing if invoice was dispatched or not if dispatched how much was dispatched.

```
Flow:
- Enter he invoice ID.
- Check the status.
```

`Manual Testing (Seeded Data)`:
```
- Enter the Invoice ID: 1.
- Done.
```

`# Any thing done outside this flow is not allowed`

---

### Sales Return Note (SRN)

Goods coming back from customer
- We first check with the invoice if that invoice was ever dispatched or not.
- The scanned serial is also checked if it was dispatched in that invoice or not.
- The return qty <= dispatched qty
- Staff select a status: Saleable, Defective, Repairable.

```
Flow:
- Enter the Invoice ID.
- Select the product that is being returned.
- Enter the qty that is being returned.
- Tag a condition: [SALEABLE, DEFECTIVE, REPAIR].
- Start SRN.
- Scan the serial of the product
- Enter the serial and it the will be added to warehouse with the status [SALEABLE, DEFECTIVE, REPAIR].
```

`Manual Testing (Seeded Data)`:
```
- Enter the Invoice ID: 2
- Select Microtek Battery 100AH
- Enter qty: 1
- Scan the serial of the product:
    - EB100-0001.
- Done.
```

`# Any thing done outside this flow will create an exception`

---

### Defective Stock

This was not included in the requirements but needed.

* The stock that was marked defective/repair are shown in this section.
* These products need to be marked `SALEABLE` so that they can be dispatched again.
* Once the product is fixed mark it `SALEABLE`.

```
Flow:
- Select the [SALEABLE, DEFECTIVE/REPAIR] option from the frontend.
- Confirmation click `Mark Saleable`.
```

`Manual Testing (Seeded Data)`:
```
- Click `SALEABLE` on MTK-BATTERY-100AH
- Click `Mark Saleable`
- Done
```

`# Any thing else can not be done on this page`

---

### Exception
Most scanning errors that represent a real discrepancy wrong serial, wrong warehouse, duplicate, condition hold, etc. are logged as exceptions on the exception desk (IDM-10), each with an OPEN status that an authorised user resolves with a mandatory reason. Pure operator guards (like "quantity already reached") just block the scan without logging, and bulk-import row errors are tracked on the import batch, not the exception desk.

```
Flow:
- Enter/Scan the exception ID of the exception or select one from the table (search & multi-filter option available).
- Enter the Correction reason
- Click correct exception && Confirmation click `Correct`.
```

`Manual Testing (Seeded Data)`:
```
- Click on the first exception shown in the table.
- Enter the reason "Product Fixed".
- Click correct exception && Confirmation click `Correct`.
- Done
```

`# Any thing else can not be done on this page`

---

### Ageing

This page has two read-only reports:
- Ageing = how long stock has been sitting (age buckets per serial).
- Reconciliation = whether SAP's total stock count matches IDM's count (quantity variance per product/warehouse).

```
Flow & Manual Testing (Seeded Data):
- Click on the bar graph of which you need to see agening data or the age gap from the table (filter option available).
- Search or Enter the filter by which you want to see data.
```

`# Any thing else can not be done on this page`

---

### Serial History

Show the life-cycle of the serial.

```
Flow:
- Enter/Scan the Serial ID of the product.
- Watch the history of that product.
```

`Manual Testing (Seeded Data)`:
```
- Enter the serial id: EB100-0001
- Watch the history.
```

`# Any thing done outside this flow will create an exception`


## Masters Panel:

Shown to admin only. Every data shown in table can be multi-filtered & search filter.

[Soft Delete: Not deleting from DB just marking it as deactivated.]

Admin can:

* `Add/Edit/Soft Delete`:
  * Warehouses.
  * User.
  * Roles & permission each role have.
* `Read`:
    * View All the invoices.
    * Incoming stock to any warehouse.
    * Stock in each warehouse.
* Bulk import/export product with CSV file.