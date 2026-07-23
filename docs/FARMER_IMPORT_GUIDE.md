# Kilimo Bridge — Farmer Import File Guide

**For cooperative administrators preparing member lists**

Version 1.0 · July 2026

---

## Overview

This guide explains how to prepare Excel or CSV files for importing farmers into Kilimo Bridge. Following these rules minimises errors and ensures every member can receive a profile and login.

---

## File format

| Accepted | Notes |
|----------|--------|
| **Excel (.xlsx)** | Preferred — upload the original workbook |
| **CSV (.csv)** | Export from Excel: **File → Save As → CSV (Comma delimited)** |

- **One cooperative per file**
- Name the file after the cooperative (e.g. `LEOART MACADAMIA FARMERS ASSOCIATION KENYA 2026.xlsx`)
- If there is no “Membership Group” column, the system uses the **file name** as the cooperative name

---

## Required columns

Every row must have a **Name** and a **Phone** number.

### Name

**Accepted column headers:** Name, Farmer Name, Full Name, Name of Farmer

| Rule | Example |
|------|---------|
| Letters, spaces, hyphens, apostrophes only | John Kamau ✓ |
| Minimum 2 characters | Mary Wanjiku ✓ |
| No numbers or symbols | John2 ✗, Mary & Sons ✗ |

### Phone

**Accepted column headers:** Phone, Mobile, Mobile No, Contact, Tel, Telephone

| Rule | Example |
|------|---------|
| **One unique number per farmer** | No duplicates in file or system |
| Kenya format: `07` + 9 digits | 0712345678 ✓ |
| Or international: `+254` + 9 digits | +254712345678 ✓ |
| Format column as **Text** in Excel | Stops Excel removing the leading 0 |

| Avoid | Why |
|-------|-----|
| 712345678 | Missing leading 0 |
| 07123456789 | Too many digits |
| Same number on two rows | Treated as duplicate |
| Landline / incomplete numbers | Cannot be used for OTP login |

---

## Recommended columns

| Column | Header names | Example |
|--------|--------------|---------|
| District | District, County | Kirinyaga |
| Sub-County | Sub-County, Sub County | Kirinyaga Central |
| Gender | Gender, Sex | M, F, Male, Female |
| ID Number | ID Number, National ID | (blank is OK — auto-filled) |

If Gender is blank, the system sets **Other**.  
If ID Number is blank, the system sets **PENDING-…**.

---

## Optional columns

Country, Parish, Village, Membership Group, Occupation, Project 1, Project 2, Project 3

---

## File layout example

```
Row 1:  LEOART MACADAMIA FARMERS ASSOCIATION KENYA 2026   (optional title)
Row 2:  (blank)
Row 3:  Name | Phone | District | Sub-County | Gender      (header row)
Row 4+: farmer data...
```

- Remove completely blank rows in the middle of the data
- Do not repeat header rows
- Delete empty rows at the bottom of the sheet

---

## Minimum viable file

Three columns are enough if the file is named after the cooperative:

| Name | Phone | District |
|------|-------|----------|
| Karanja Njiiri | 0723875429 | Kirinyaga |
| Charles Njagi | 0712345678 | Kirinyaga |

---

## Before you upload — checklist

1. ☐ Every farmer has a **unique** phone number  
2. ☐ All phones are `07……` or `+254……` format  
3. ☐ Names contain **letters only** (no numbers or & symbols)  
4. ☐ Phone column formatted as **Text** in Excel  
5. ☐ File saved as `.xlsx` or CSV (Comma delimited)  
6. ☐ File name matches the cooperative name  

---

## Import results explained

| Status | Meaning |
|--------|---------|
| **Valid** | Will be imported — profile + login created |
| **Duplicate** | Phone already in system — skipped (not an error) |
| **Invalid** | Fix in Excel using the error report, then re-upload |

After validation, download the **errors CSV** to see every row that needs fixing. Use the **Row** column to find the line in your spreadsheet.

---

## Support

For Kilimo Bridge technical support, contact your platform administrator.

*Kilimo Bridge — connecting farmers, cooperatives, and markets*
