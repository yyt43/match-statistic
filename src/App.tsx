import { Suspense, lazy } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { LanguageProvider } from "@/i18n";

// 页面按需加载：主包只保留框架与状态层，赛事工作区等大页面单独成块。
const EntryPage = lazy(() => import("@/pages/EntryPage"));
const MultiStageSetup = lazy(() => import("@/pages/MultiStageSetup"));
const Home = lazy(() => import("@/pages/Home"));

export default function App() {
  return (
    <LanguageProvider>
      <ErrorBoundary>
        <Router>
          <Suspense fallback={<div className="min-h-screen" />}>
            <Routes>
              <Route path="/" element={<EntryPage />} />
              <Route path="/multi-stage" element={<MultiStageSetup />} />
              <Route path="/workspace" element={<Home />} />
            </Routes>
          </Suspense>
        </Router>
      </ErrorBoundary>
    </LanguageProvider>
  );
}
