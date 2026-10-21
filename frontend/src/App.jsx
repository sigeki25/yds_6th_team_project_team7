import { Outlet, Route, Routes } from "react-router";
import Header from "./components/Header.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import { CourseProvider } from "./course/CourseProvider.jsx";
import HomePage from "./pages/HomePage.jsx";
import FestivalListPage from "./pages/FestivalListPage.jsx";
import FestivalDetailPage from "./pages/FestivalDetailPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import CoursePage from "./pages/CoursePage.jsx";

function Layout() {
  return (
    <>
      <Header />
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <CourseProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />                             {/* H110 · H120 */}
            <Route path="festivals" element={<FestivalListPage />} />           {/* L110 */}
            <Route path="festivals/:id" element={<FestivalDetailPage />} />     {/* D110 */}
            <Route path="*" element={<NotFoundPage />} />                       {/* E110 */}
          </Route>
          <Route path="course" element={<CoursePage />} />                    {/* R110 (헤더 없음) */}
        </Routes>
      </CourseProvider>
    </ToastProvider>
  );
}
