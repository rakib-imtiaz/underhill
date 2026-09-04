import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Services from "./pages/Services";
import Projects from "./pages/Projects";
import About from "./pages/About";
import Team from "./pages/Team";
import Approach from "./pages/Approach";
import Careers from "./pages/Careers";
import Story from "./pages/Story";
import ContactPage from "./pages/ContactPage";
import NotFound from "./pages/NotFound";

/* Service detail pages — one per service line. */
import AerialSurveying from "./pages/services/AerialSurveying";
import ConstructionSurveying from "./pages/services/ConstructionSurveying";
import DeformationMonitoring from "./pages/services/DeformationMonitoring";
import HydrographicSurveying from "./pages/services/HydrographicSurveying";
import LaserScanning from "./pages/services/LaserScanning";
import CadastralSurveying from "./pages/services/CadastralSurveying";
import FirstNationsSurveying from "./pages/services/FirstNationsSurveying";
import RailwaySurveying from "./pages/services/RailwaySurveying";
import TopographicSurveying from "./pages/services/TopographicSurveying";
import BomaSurveying from "./pages/services/BomaSurveying";
import BimModelling from "./pages/services/BimModelling";

/* Project category listing pages. */
import CategoryConstruction from "./pages/projects/Construction";
import CategoryEnvironmental from "./pages/projects/Environmental";
import CategoryFirstNations from "./pages/projects/FirstNations";
import CategoryHistorical from "./pages/projects/Historical";
import CategoryInfrastructure from "./pages/projects/Infrastructure";
import CategoryMining from "./pages/projects/Mining";
import CategoryEnergy from "./pages/projects/Energy";

/* Paths are declared without the trailing slash; React Router v6 matches the
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
