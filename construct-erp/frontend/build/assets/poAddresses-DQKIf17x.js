const s=`LANCO HILLS - LH10
LANCO Hills Residential Apartments, Tower - LH10,
Survey nos 201, Manikonda, Rajendranagar Mandal,
HYDERABAD - 500089
Contact Person BCIM: Mr. Vijayan - 82700 94285`,t=`Residential Apartments - Yelahanka (Retaining Wall & STP)
Project: DQS, YNT 63, Survey No. 5/3 & 6/1, Mandalakunte Village,
Chikkabommasandra, Yelahanka Hobli, Near Mother Dairy, Bangalore 560065
Contact Person: Mr. Ananthan 73036 75533`,o=`BCIM Engineering Private Limited
TOWER VIEW APARTMENT, NO 403, 4th FLOOR,
PLOT NO 26 & 27, SRI LAKSHMI NAGAR COLONY,
HYDERABAD, RANGAREDDY DIST, TELANGANA – 500089
GSTIN: 36AAHCB6485A1ZQ`,l=`BCIM ENGINEERING PRIVATE LIMITED
#11, B Wing, Divyasree Chambers, O'Shaughnessy Road
Bangalore, Karnataka – 560025
GSTIN: 29AAHCB6485A1ZL`;function i(...a){const n=a.filter(Boolean).join(" ").toLowerCase().replace(/[\s-]/g,"");return n.includes("lanco")||n.includes("lancho")||n.includes("lh10")}function r(...a){const n=a.filter(Boolean).join(" ").toLowerCase().replace(/[\s-]/g,"");return n.includes("wdiry0151")||n.includes("yelah")||n.includes("dqs")&&n.includes("ynt")||n.includes("dqsmb")||n.includes("dqs")&&n.includes("tower")}function A(a,n){return i(a,n)?o:l}function c(a){if(!a)return"";if(i(a.project_code,a.name))return s;if(r(a.project_code,a.name))return t;const n=[a.name].filter(Boolean);a.location&&n.push(a.location);const e=[a.city,a.state].filter(Boolean).join(", ");return e&&n.push(e),n.join(`
`)}export{t as D,s as L,c as a,r as b,A as g,i};
