import { lazy } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
const Services = lazy(() => import("./pages/Services"));
const Projects = lazy(() => import("./pages/Projects"));
const About = lazy(() => import("./pages/About"));
const Team = lazy(() => import("./pages/Team"));
const Approach = lazy(() => import("./pages/Approach"));
const Careers = lazy(() => import("./pages/Careers"));
const Story = lazy(() => import("./pages/Story"));
const Industries = lazy(() => import("./pages/Industries"));
const HealthSafety = lazy(() => import("./pages/HealthSafety"));
const Affiliations = lazy(() => import("./pages/Affiliations"));
const UnderhillBrand = lazy(() => import("./pages/UnderhillBrand"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

/* Service detail pages — one per service line. */
const AerialSurveying = lazy(() => import("./pages/services/AerialSurveying"));
const ConstructionSurveying = lazy(() => import("./pages/services/ConstructionSurveying"));
const DeformationMonitoring = lazy(() => import("./pages/services/DeformationMonitoring"));
const HydrographicSurveying = lazy(() => import("./pages/services/HydrographicSurveying"));
const LaserScanning = lazy(() => import("./pages/services/LaserScanning"));
const CadastralSurveying = lazy(() => import("./pages/services/CadastralSurveying"));
const FirstNationsSurveying = lazy(() => import("./pages/services/FirstNationsSurveying"));
const RailwaySurveying = lazy(() => import("./pages/services/RailwaySurveying"));
const TopographicSurveying = lazy(() => import("./pages/services/TopographicSurveying"));
const BomaSurveying = lazy(() => import("./pages/services/BomaSurveying"));
const BimModelling = lazy(() => import("./pages/services/BimModelling"));

/* Project category listing pages. */
const CategoryConstruction = lazy(() => import("./pages/projects/Construction"));
const CategoryEnvironmental = lazy(() => import("./pages/projects/Environmental"));
const CategoryFirstNations = lazy(() => import("./pages/projects/FirstNations"));
const CategoryHistorical = lazy(() => import("./pages/projects/Historical"));
const CategoryInfrastructure = lazy(() => import("./pages/projects/Infrastructure"));
const CategoryMining = lazy(() => import("./pages/projects/Mining"));
const CategoryEnergy = lazy(() => import("./pages/projects/Energy"));

/* Every page but Home is split into its own chunk (React.lazy): the home page — and its hero —
   no longer waits for the other pages' code and their three.js scenes. Layout suspends the outlet.

   Paths are declared without the trailing slash; React Router v6 matches the
   source site's trailing-slash URLs (`/our-team/`) against them, so every link
   keeps the exact href it had in the static clone. */
export default function App() {
  return (
    <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/geospatial-services" element={<Services />} />
          {/* service detail pages */}
          <Route
            path="/geospatial-services/aerial-surveying"
            element={<AerialSurveying />}
          />
          <Route
            path="/geospatial-services/construction-surveying"
            element={<ConstructionSurveying />}
          />
          <Route
            path="/geospatial-services/deformation-monitoring"
            element={<DeformationMonitoring />}
          />
          <Route
            path="/geospatial-services/hydrographic-surveying"
            element={<HydrographicSurveying />}
          />
          <Route
            path="/geospatial-services/3d-laser-scanning-reality-capture"
            element={<LaserScanning />}
          />
          <Route
            path="/geospatial-services/cadastral-surveying"
            element={<CadastralSurveying />}
          />
          <Route
            path="/geospatial-services/first-nations-land-claims-surveying"
            element={<FirstNationsSurveying />}
          />
          <Route
            path="/geospatial-services/railway-surveying"
            element={<RailwaySurveying />}
          />
          <Route
            path="/geospatial-services/topographic-surveying"
            element={<TopographicSurveying />}
          />
          <Route
            path="/geospatial-services/boma-surveying"
            element={<BomaSurveying />}
          />
          <Route
            path="/geospatial-services/bim-modelling-services"
            element={<BimModelling />}
          />
          <Route path="/land-surveying-projects" element={<Projects />} />
          {/* project category listing pages */}
          <Route
            path="/category/land-survey-projects/construction"
            element={<CategoryConstruction />}
          />
          <Route
            path="/category/land-survey-projects/environmental"
            element={<CategoryEnvironmental />}
          />
          <Route
            path="/category/land-survey-projects/first-nations"
            element={<CategoryFirstNations />}
          />
          <Route
            path="/category/land-survey-projects/historical"
            element={<CategoryHistorical />}
          />
          <Route
            path="/category/land-survey-projects/infrastructure"
            element={<CategoryInfrastructure />}
          />
          <Route
            path="/category/land-survey-projects/mining"
            element={<CategoryMining />}
          />
          <Route
            path="/category/land-survey-projects/energy"
            element={<CategoryEnergy />}
          />
          <Route path="/about-underhill-geomatics" element={<About />} />
        <Route path="/our-team" element={<Team />} />
        <Route path="/our-approach" element={<Approach />} />
        <Route path="/careers" element={<Careers />} />
        <Route path="/story" element={<Story />} />
        {/* About sub-pages */}
        <Route
          path="/about-underhill-geomatics/land-surveyors"
          element={<Industries />}
        />
        <Route
          path="/about-underhill-geomatics/health-safety"
          element={<HealthSafety />}
        />
        <Route
          path="/about-underhill-geomatics/affiliations"
          element={<Affiliations />}
        />
        <Route
          path="/about-underhill-geomatics/underhill-brand"
          element={<UnderhillBrand />}
        />
        {/* legacy source-site URLs keep working */}
        <Route path="/about-underhill-geomatics/careers" element={<Careers />} />
        <Route path="/history-of-underhill-geomatics" element={<Story />} />
        <Route
          path="/vancouver-land-surveyors"
          element={<ContactPage slug="vancouver-land-surveyors" />}
        />
        <Route
          path="/vancouver-island-land-surveyors"
          element={<ContactPage slug="vancouver-island-land-surveyors" />}
        />
        <Route
          path="/kamloops-land-surveyors"
          element={<ContactPage slug="kamloops-land-surveyors" />}
        />
        <Route
          path="/whitehorse-land-surveyors"
          element={<ContactPage slug="whitehorse-land-surveyors" />}
        />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
  );
}
