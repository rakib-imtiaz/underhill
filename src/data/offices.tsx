import type { ReactNode } from "react";

/**
 * The four contact/location pages. Every string here is lifted from the
 * corresponding page in the static site — addresses, phone/fax numbers, office
 * names, service areas, staff names and featured project lists included.
 * Nothing is inferred or filled in: where the source page had no fax number
 * (Vancouver Island), the field is simply absent.
 */
export type Office = {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  heroImage: string;
  lead: string;
  /** the left column of the contact split */
  introHeading: string;
  introBody: string;
  card: {
    name: string;
    address: string;
    phone: string;
    fax?: string;
  };
  /** body sections below the contact split */
  sections: { heading: string; body: ReactNode }[];
  /** "Office Managing Partner(s)" block */
  peopleHeading?: string;
  people?: { name: string; role?: string }[];
  featuredHeading: string;
  featured: ReactNode[];
};

export const OFFICES: Office[] = [
  {
    slug: "vancouver-land-surveyors",
    title: "Trusted Vancouver Land Surveyors Since 1913",
    metaTitle: "Trusted Vancouver Land Surveyors Since 1913 | Underhill Geomatics",
    metaDescription:
      "Vancouver land surveyors from Underhill have led the way in professional surveying since our founding office opened in 1913.",
    heroImage:
      "/assets/uploads/2025/05/Underhill-Geomatics-Burnaby_029_Eagle-Vision-Agency_20240510.jpg",
    lead: "Vancouver land surveyors from Underhill have led the way in professional surveying since our founding office opened in 1913.",
    introHeading: "Vancouver Area Surveyors & Survey Engineers",
    introBody:
      "Underhill's Vancouver office is the original home of Underhill & Underhill—founded in 1913 by the Underhill brothers.",
    card: {
      name: "Vancouver — Head Office",
      address: "301, 8337 Eastlake Drive, Burnaby, BC V5A 4W2 Canada",
      phone: "604-732-3384",
      fax: "604-732-4709",
    },
    sections: [
      {
        heading: "Vancouver Area Surveyors & Survey Engineers",
        body: (
          <>
            <p>
              For over 100 years, our team of licensed Vancouver land surveyors has
              delivered trusted, professional surveying services across the city and the
              entire Lower Mainland.
            </p>
            <p>
              From urban development to infrastructure planning, our Vancouver-based
              surveyors support residential, commercial, and public sector clients with
              accurate data and deep local knowledge.
            </p>
            <p>
              As the head office, we coordinate projects of all sizes across British
              Columbia with a commitment to precision and integrity.
            </p>
          </>
        ),
      },
    ],
    peopleHeading: "Vancouver Office Managing Partners",
    people: [
      { name: "Chris El-Araj, BCLS", role: "President" },
      { name: "Jon Cormier, BCLS", role: "Partner" },
    ],
    featuredHeading: "Featured Vancouver Projects",
    featured: [
      "Canada Line Surveying: Rapid Transit Infrastructure from Vancouver to YVR",
      "Pattullo Bridge Replacement Hydraulic Model Surveying",
      "Second Narrows Water Tunnel Real-Time Monitoring",
    ],
  },

  {
    slug: "vancouver-island-land-surveyors",
    title: "Vancouver Island Land Surveyors for Every Project",
    metaTitle:
      "Vancouver Island Land Surveyors for Every Project | Underhill Geomatics",
    metaDescription:
      "Vancouver Island land surveyors from Underhill provide geomatics services across Vancouver Island, supporting projects of all scales.",
    heroImage:
      "/assets/uploads/2025/05/Underhill-Geomatics-Victoria_017_Eagle-Vision-Agency_20230705.jpg",
    lead: "Vancouver Island land surveyors from Underhill provide geomatics services across Vancouver Island, supporting projects of all scales.",
    introHeading: "Survey Expertise for Vancouver Island's Diverse Needs",
    introBody:
      "Whether you're developing residential property, planning public infrastructure, or managing utility projects, our experienced survey engineers deliver reliable data and responsive service tailored to Vancouver Island's diverse terrain.",
    card: {
      name: "Vancouver Island — Comox Valley",
      address: "#347 4th Street, Courtenay, BC, V9N 1G8, Canada",
      phone: "250-871-4599",
    },
    sections: [
      {
        heading: "Vancouver Island Area Surveyors & Survey Engineers",
        body: (
          <>
            <p>
              Underhill's Vancouver Island team provides licensed land surveying services
              from four locations across the region.
            </p>
            <p>
              Our land surveyors support communities including the Comox Valley, Campbell
              River, Powell River, Tofino, Ucluelet, North Island, Port Alberni,
              Parksville, Qualicum Beach, Nanaimo, and Victoria.
            </p>
          </>
        ),
      },
    ],
    peopleHeading: "Vancouver Island Office Branch Manager",
    people: [{ name: "Evan Wind, BCLS", role: "Branch Manager" }],
    featuredHeading: "Featured Projects",
    featured: [
      "Erik Nielsen Whitehorse International Airport Improvements",
      "Pattullo Bridge Replacement Hydraulic Model Surveying",
      "Second Narrows Water Tunnel Real-Time Monitoring",
    ],
  },

  {
    slug: "kamloops-land-surveyors",
    title: "Trusted Kamloops Land Surveyors",
    metaTitle: "Trusted Kamloops Land Surveyors | Underhill Geomatics",
    metaDescription:
      "Kamloops land surveyors at Underhill have supported Central and Northern British Columbia since opening our Kamloops office in 2004.",
    heroImage:
      "/assets/uploads/2025/05/Underhill-Geomatics-Kamloops_037_Eagle-Vision-Agency_20240313.jpg",
    lead: "Kamloops land surveyors at Underhill have supported Central and Northern British Columbia since opening our Kamloops office in 2004.",
    introHeading: "Surveying Expertise for Kamloop's Diverse Needs",
    introBody:
      "We offer a full range of professional surveying services for land development, engineering, construction, and public infrastructure projects. Whether you're planning a residential build or a large-scale industrial site, our Kamloops-based surveyors bring experience, precision, and local knowledge to every job.",
    card: {
      name: "Kamloops",
      address: "201 – 925 McMaster Way, Kamloops, BC V2C 6K2, Canada",
      phone: "250-372-8835",
      fax: "250-372-3518",
    },
    sections: [
      {
        heading: "Kamloops Area Surveyors & Survey Engineers",
        body: (
          <>
            <p>
              Underhill's Kamloops office has been delivering trusted land surveying
              services for over two decades.
            </p>
            <p>
              Our team of Kamloops land surveyors and survey engineers supports clients
              across Kamloops, Central BC, and Northern British Columbia.
            </p>
            <p>
              Our Kamloops office service areas include; Kamloops, Merritt, Ashcroft,
              Cache Creek, Chase, Clearwater, Logan Lake, Barriere, Lytton, Savona, Sun
              Peaks, Spences Bridge, Kelowna, Vernon, Penticton, Summerland, Peachland,
              West Kelowna, Westbank, Osoyoos, Oliver, Princeton, Keremeos, Okanagan
              Falls, Lake Country, Winfield, Oyama, Armstrong, Enderby, Lumby, Falkland,
              Salmon Arm, Sicamous, Sorrento, Valemount, McBride, Prince George.
            </p>
          </>
        ),
      },
    ],
    peopleHeading: "Kamloops Office Managing Partner",
    people: [{ name: "Ryan Schuler, P.Eng., CLS" }],
    featuredHeading: "Featured Projects",
    featured: [
      <>
        <strong>Site C Hydroelectric Dam</strong> – High Precision Monitoring
      </>,
      <>
        <strong>Site C Hydroelectric Dam</strong> – Slope Monitoring
      </>,
      <>
        <strong>Site C Hydroelectric Dam</strong> – Large Scale UAV Mapping/Processing
        Program
      </>,
      "Peace Canyon Water Spillway Monitoring",
      "Parkland Burnaby Refinery Surveying & 3D Laser Scanning",
    ],
  },

  {
    slug: "whitehorse-land-surveyors",
    title: "Whitehorse Land Surveyors Serving Yukon and Northern Canada",
    metaTitle:
      "Whitehorse Land Surveyors Serving Yukon and Northern Canada | Underhill Geomatics",
    metaDescription:
      "Whitehorse land surveyors at Underhill have delivered professional surveying and geomatics services across the North for over 50 years.",
    heroImage:
      "/assets/uploads/2025/07/Underhill-Geomatics-Whitehorse_017_Eagle-Vision-Agency_20240515.jpg",
    lead: "Whitehorse land surveyors at Underhill have delivered professional surveying and geomatics services across the North for over 50 years.",
    introHeading: "Whitehorse Area Surveyors & Survey Engineers",
    introBody:
      "Located in Yukon's capital, our Whitehorse office serves as a regional hub for projects throughout the Yukon, Northwest Territories, Nunavut, and Northern British Columbia and Alberta.",
    card: {
      name: "Whitehorse — Yukon & the North",
      address: "4081 – 4th Ave., Whitehorse, YT Y1A 1H3, Canada",
      phone: "867-668-2048",
      fax: "867-668-4456",
    },
    sections: [
      {
        heading: "Whitehorse Area Surveyors & Survey Engineers",
        body: (
          <p>
            From mineral exploration to infrastructure and land development, our licensed
            land surveyors and survey engineers provide reliable, high-accuracy data for
            public and private sector clients operating in some of Canada's most remote
            and rugged environments.
          </p>
        ),
      },
    ],
    peopleHeading: "Whitehorse Office Managing Parter",
    people: [{ name: "Sandy Cooke, P.Eng.", role: "Partner" }],
    featuredHeading: "Featured Whitehorse Projects",
    featured: [
      "Erik Nielsen Whitehorse International Airport Improvements",
      "Robert Campbell Bridge Real-Time Monitoring",
      "Whistle Bend Continuing Care Facility Surveying",
    ],
  },
];

export const officeBySlug = (slug: string) => OFFICES.find((o) => o.slug === slug);
