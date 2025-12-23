# Napkin AI Prompt (Concise Version)

Create a block diagram for Score Computation in a Faculty Feedback System showing:

**Flow:**
1. **Input**: Student Feedback Responses (values 1, 2, 3)
2. **Question Level**: 
   - Count responses per option (1, 2, 3)
   - Calculate weighted sum: (count_1×0) + (count_2×1) + (count_3×2)
   - Calculate max possible: totalResponses × 2
   - Question Score = (weightedSum / maxPossible) × 100
3. **Section Level**:
   - Group questions by section
   - Section Score = Average of question scores in section
   - Filter: Exclude "COURSE CONTENT AND STRUCTURE" and "STUDENT-CENTRIC FACTORS"
4. **Overall Level**:
   - Overall Score = Average of filtered section scores (rounded)

**Weighting**: Option 1=0pts, Option 2=1pt, Option 3=2pts

**Visual**: Top-to-bottom flow with calculation blocks, formulas shown, color-coded by layer (Input=Blue, Calculation=Green, Filter=Yellow, Output=Orange)
















