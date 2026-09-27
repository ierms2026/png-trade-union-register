// =============================================================================
// Demo document text content generator — produces realistic, searchable text
// for each document type. Used by the seed script to populate both the PDF
// file content AND the DocumentVersion.textContent field.
//
// The text includes searchable phrases that a Registrar might look for:
//   - "secret ballot" (in Constitution, Election of Office Bearers)
//   - "award variation" (in Awards, Constitution)
//   - "election of office bearers" (in Constitution, Election of Office Bearers)
//   - "financial return" (in Financial Return)
//   - "annual general meeting" (in Constitution, Financial Return)
//   - "Industrial Organizations Act" (in most documents)
//
// This makes the demo DB fully searchable out of the box — the Registrar can
// test the full-text search (chunk 6) + OCR (chunk 7) immediately after
// seeding, without needing to upload real documents first.
// =============================================================================

interface DocTextParams {
  unionName: string;
  registrationNo: string;
  documentType: string;
  fileName: string;
  filedDaysAgo: number;
}

/**
 * Generate realistic text content for a demo document.
 *
 * The text varies by document type + includes the union's name + registration
 * number so search results are distinguishable. All text is English (matches
 * the registry's language).
 */
export function generateDocText(params: DocTextParams): string {
  const { unionName, registrationNo, documentType, fileName, filedDaysAgo } = params;
  const filedDate = new Date(Date.now() - filedDaysAgo * 24 * 60 * 60 * 1000);
  const filedDateStr = filedDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const generators: Record<string, () => string> = {
    "Registration Certificate": () => `CERTIFICATE OF REGISTRATION OF INDUSTRIAL ORGANIZATION

This is to certify that ${unionName} has been duly registered as an industrial organization under section 27 of the Industrial Organizations Act.

Registration Number: ${registrationNo}
File Number: ${fileName}
Date of Registration: ${filedDateStr}

The organization is hereby authorized to operate as a registered trade union in accordance with the Industrial Organizations Act and the rules set forth in its constitution.

The registered office of the organization shall be at the address on file with the Industrial Registrar. Any changes to the registered address must be notified within 30 days.

This certificate remains in force unless cancelled or suspended by the Industrial Registrar in accordance with the provisions of the Act.

Sealed and signed by the Industrial Registrar.`,

    Constitution: () => `CONSTITUTION OF ${unionName.toUpperCase()}

Pursuant to section 27 of the Industrial Organizations Act, the following constitution is hereby adopted:

NAME
The name of the organization shall be ${unionName} (hereinafter referred to as "the Union").

OBJECTS
The objects of the Union shall be to protect and advance the interests of its members in matters relating to their employment, to regulate relations between members and their employers, and to provide such benefits and services as may from time to time be determined.

MEMBERSHIP
Membership of the Union shall be open to all persons employed in the relevant industry who agree to abide by this constitution. The annual subscription shall be determined at the annual general meeting.

ELECTION OF OFFICE BEARERS
The election of office bearers shall be conducted by secret ballot at the annual general meeting. Nominations for office bearer positions shall be called at least 28 days before the annual general meeting. Every candidate for election shall be a financial member of the Union.

ANNUAL GENERAL MEETING
The annual general meeting shall be held within five months of the end of the financial year. The business of the annual general meeting shall include the election of office bearers, the receipt of the financial return, and the consideration of any award variation proposed by the members.

FINANCES
The funds of the Union shall be derived from membership subscriptions, donations, and investments. The financial return shall be prepared annually and audited by a qualified auditor.

AMENDMENTS
This constitution may be amended by a resolution passed by a two-thirds majority of the members present at a duly convened general meeting. No amendment shall take effect until registered with the Industrial Registrar.

DISSOLUTION
Upon dissolution, the assets of the Union shall be distributed in accordance with a resolution passed at a general meeting convened for that purpose.`,

    "Financial Return": () => `ANNUAL FINANCIAL RETURN — ${unionName}

Registration Number: ${registrationNo}
File Reference: ${fileName}
Return Period: Financial year ending ${filedDateStr}

INCOME
Membership subscriptions:          K 285,000.00
Donations and grants:              K  12,500.00
Investment income:                 K   8,750.00
Total income:                      K 306,250.00

EXPENDITURE
Salaries and wages:                K 145,000.00
Office rental and utilities:       K  38,000.00
Legal and professional fees:       K  22,500.00
Affiliation fees:                  K  15,000.00
Audit and accounting:              K  12,000.00
Total expenditure:                 K 232,500.00

SURPLUS FOR THE YEAR:              K  73,750.00

STATEMENT OF FINANCIAL POSITION
Total assets:                      K 450,000.00
Total liabilities:                 K 120,000.00
Net assets:                        K 330,000.00

AUDITOR'S REPORT
I have audited the accompanying financial return of ${unionName} for the financial year ended ${filedDateStr}. In my opinion, the financial return presents fairly the financial position of the organization.

The financial return was considered and adopted at the annual general meeting held on ${filedDateStr}.

Signed: Treasurer
Signed: Auditor`,

    "Election of Office Bearers": () => `RECORD OF ELECTION OF OFFICE BEARERS — ${unionName}

Registration Number: ${registrationNo}
File Reference: ${fileName}
Date of Election: ${filedDateStr}

In accordance with the constitution of ${unionName}, the election of office bearers was conducted by secret ballot at the annual general meeting held on ${filedDateStr}.

The following members were nominated for the positions indicated:

PRESIDENT
1. John Kaupa (nominated by Mary Tua)
2. Peter Bani (nominated by Samuel Lavong)
Result: John Kaupa elected (67 votes to 43 votes)

VICE PRESIDENT
1. Grace Anderson (nominated by John Kaupa)
2. Joseph Wartovo (nominated by Mary Tua)
Result: Grace Anderson elected (72 votes to 38 votes)

SECRETARY
1. Mary Tua (nominated by John Kaupa)
Unopposed — declared elected

TREASURER
1. Samuel Lavong (nominated by Grace Anderson)
Unopposed — declared elected

The election was supervised by an officer of the Industrial Registrar. The ballot papers were counted in the presence of the candidates and the result declared at the meeting.

All elected office bearers have confirmed their acceptance of office in writing.

Signed: Returning Officer
Signed: Secretary`,

    "Financial Membership List": () => `FINANCIAL MEMBERSHIP LIST — ${unionName}

Registration Number: ${registrationNo}
File Reference: ${fileName}
As at: ${filedDateStr}

The following is a list of all financial members of ${unionName} as at the above date. A financial member is a member whose subscription is fully paid up.

MEMBER LIST
1.  Kaupa, John         — Member No. 001 — Subscription paid to 31 Dec
2.  Tua, Mary           — Member No. 002 — Subscription paid to 31 Dec
3.  Bani, Peter         — Member No. 003 — Subscription paid to 31 Dec
4.  Lavong, Samuel      — Member No. 004 — Subscription paid to 31 Dec
5.  Anderson, Grace     — Member No. 005 — Subscription paid to 31 Dec
6.  Wartovo, Joseph     — Member No. 006 — Subscription paid to 31 Dec
7.  Tovue, Mary         — Member No. 007 — Subscription paid to 31 Dec
8.  Kaupa, Sarah        — Member No. 008 — Subscription paid to 31 Dec
9.  Bani, James         — Member No. 009 — Subscription paid to 31 Dec
10. Lavong, Anna        — Member No. 010 — Subscription paid to 31 Dec

TOTAL FINANCIAL MEMBERS: 247

I certify that the above list is a true and correct record of the financial members of ${unionName} as at ${filedDateStr}.

Signed: Secretary
Signed: Treasurer`,

    Awards: () => `INDUSTRIAL AWARD VARIATION — ${unionName}

Registration Number: ${registrationNo}
File Reference: ${fileName}
Date of Variation: ${filedDateStr}

PURSUANT to the Industrial Organizations Act, the following award variation is hereby registered:

1. SHORT TITLE
This award variation may be cited as the ${unionName} Award Variation ${filedDate.getFullYear()}.

2. APPLICATION
This award variation applies to all members of ${unionName} employed in the industry covered by the parent award.

3. WAGE RATES
The minimum wage rates for members shall be varied as follows, effective from the date of registration of this award variation:

   - Grade 1: K 3.50 per hour (previously K 3.20)
   - Grade 2: K 4.20 per hour (previously K 3.85)
   - Grade 3: K 5.10 per hour (previously K 4.65)
   - Grade 4: K 6.25 per hour (previously K 5.75)

4. ALLOWANCES
The following allowances shall apply:
   - Meal allowance: K 15.00 per meal (where required to work overtime)
   - Travel allowance: K 2.50 per kilometre (where required to use own vehicle)

5. HOURS OF WORK
The ordinary hours of work shall be 38 per week, worked Monday to Friday between the hours of 7:00 am and 6:00 pm.

6. CONSULTATION
The award variation was approved by a two-thirds majority of the members present at the annual general meeting held on ${filedDateStr}.

Signed: Secretary
Signed: Industrial Registrar`,

    Affiliations: () => `STATEMENT OF AFFILIATIONS — ${unionName}

Registration Number: ${registrationNo}
File Reference: ${fileName}
Date: ${filedDateStr}

Pursuant to the Industrial Organizations Act, ${unionName} declares the following affiliations:

1. PAPUA NEW GUINEA TRADE UNION CONGRESS
   The Union is affiliated with the Papua New Guinea Trade Union Congress (TUC) and pays an annual affiliation fee based on the number of financial members.

2. INTERNATIONAL TRANSPORT WORKERS FEDERATION
   The Union is affiliated with the International Transport Workers Federation (ITF) for the purpose of international solidarity and information exchange.

3. NATIONAL WORKERS ASSOCIATION
   The Union maintains a working relationship with the National Workers Association on matters of common interest including occupational health and safety.

The total amount paid in affiliation fees during the financial year was K 15,000.00.

The Union confirms that all affiliations are in accordance with the objects of the Union as set out in its constitution.

Signed: Secretary
Signed: President`,

    "Secret Ballots": () => `RECORD OF SECRET BALLOT — ${unionName}

Registration Number: ${registrationNo}
File Reference: ${fileName}
Date of Ballot: ${filedDateStr}

In accordance with the constitution of ${unionName}, a secret ballot was conducted on ${filedDateStr} to determine the following question:

"Should the Union accept the proposed award variation to the wage rates and conditions of employment?"

ARRANGEMENTS
The secret ballot was conducted under the supervision of an officer of the Industrial Registrar. Ballot papers were printed with a unique serial number. Voting was by secret ballot in sealed ballot boxes.

RESULT
   Votes in favour:   156
   Votes against:      54
   Informal votes:      3
   Total votes cast:  213

The motion was carried by a majority of 102 votes.

The result was declared at a general meeting of the Union held on ${filedDateStr} and entered in the minutes.

Signed: Returning Officer
Signed: Secretary`,

    "Application for Registration": () => `APPLICATION FOR REGISTRATION OF INDUSTRIAL ORGANIZATION

To the Industrial Registrar:

We, the undersigned, hereby apply for the registration of ${unionName} as an industrial organization under the Industrial Organizations Act.

1. NAME OF ORGANIZATION
   ${unionName}

2. PROPOSED REGISTRATION NUMBER
   ${registrationNo}

3. ADDRESS OF REGISTERED OFFICE
   As per the attached schedule.

4. OBJECTS OF THE ORGANIZATION
   To protect and advance the interests of members in matters relating to their employment.

5. NUMBER OF MEMBERS
   The organization has 47 financial members as at the date of this application.

6. CONSTITUTION
   A copy of the proposed constitution is attached.

7. OFFICE BEARERS
   The following office bearers have been elected:
   - President: John Kaupa
   - Secretary: Mary Tua
   - Treasurer: Samuel Lavong

We declare that the information in this application is true and correct.

Signed: John Kaupa (President)
Signed: Mary Tua (Secretary)
Date: ${filedDateStr}`,
  };

  // Default fallback for unknown document types
  const generator = generators[documentType] ?? (() => `DOCUMENT: ${documentType}

Union: ${unionName}
Registration Number: ${registrationNo}
File Reference: ${fileName}
Date Filed: ${filedDateStr}

This document is filed in accordance with the Industrial Organizations Act. The document relates to the registered trade union ${unionName} (registration number ${registrationNo}).

For further information, contact the Industrial Registrar's office.`);

  return generator();
}
