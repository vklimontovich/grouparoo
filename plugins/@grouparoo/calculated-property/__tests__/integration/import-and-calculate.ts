import path from "path";
process.env.GROUPAROO_INJECTED_PLUGINS = JSON.stringify({
  "@grouparoo/calculated-property": { path: path.join(__dirname, "..", "..") },
});

// import { helper } from "@grouparoo/spec-helper";

// import { plugin, Profile, Property } from "@grouparoo/core";

test("placeholder", () => {
  expect(2).toEqual(2);
});

/* 
TESTING TO DO:
[] it calculates
[] it parses an undefined parent property as an empty string ---> test in core?
[] it calculates a property based upon another calculated property
[] it recalculates on every run
----> currently, if you change a parent property, it does NOT automatically recalculate the calculated property... am thinking it should
[]  
[] 
*/
