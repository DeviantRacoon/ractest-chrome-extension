import React from "react";
import { RecipesView } from "../modules/recipes";
import { useRecipes } from "../modules/recipes/hooks/useRecipes";

const RecipesPage: React.FC = () => {
  const logic = useRecipes();
  return <RecipesView {...logic} />;
};

export default RecipesPage;
