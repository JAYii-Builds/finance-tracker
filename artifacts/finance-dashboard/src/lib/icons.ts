import {
  FaMoneyBillWave,
  FaLaptopCode,
  FaChartLine,
  FaHome,
  FaUtensils,
  FaCar,
  FaHeartbeat,
  FaShoppingBag,
  FaBolt,
  FaFilm,
  FaCoffee,
  FaShoppingCart,
  FaGraduationCap,
  FaPlane,
  FaHospital,
  FaQuestion,
} from "react-icons/fa";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FaMoneyBillWave,
  FaLaptopCode,
  FaChartLine,
  FaHome,
  FaUtensils,
  FaCar,
  FaHeartbeat,
  FaShoppingBag,
  FaBolt,
  FaFilm,
  FaCoffee,
  FaShoppingCart,
  FaGraduationCap,
  FaPlane,
  FaHospital,
  "money-bill": FaMoneyBillWave,
  "home": FaHome,
  "utensils": FaUtensils,
  "car": FaCar,
  "shopping-bag": FaShoppingBag,
  "bolt": FaBolt,
  "film": FaFilm,
};

export function getIcon(iconName: string): React.ComponentType<{ className?: string }> {
  return iconMap[iconName] ?? FaQuestion;
}
