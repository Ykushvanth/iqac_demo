# Napkin AI Prompt: Score Computation Block Diagram

Create a block diagram showing the Score Computation flow for a Faculty Feedback Analysis System. The diagram should illustrate how student feedback responses are processed to calculate question scores, section scores, and overall scores.

## Diagram Structure:

### Level 1: Input Layer
- **Block 1**: "Student Feedback Responses"
  - Input: Feedback data with response values (1, 2, or 3)
  - Description: Raw student responses for each question
  - Output arrows to: "Question Processing"

### Level 2: Question Processing Layer
- **Block 2**: "Count Responses per Option"
  - Input: Student feedback responses
  - Process: Count occurrences of each option value (1, 2, 3)
  - Output: Counts for Option 1, Option 2, Option 3
  - Output arrows to: "Calculate Weighted Sum"

- **Block 3**: "Calculate Weighted Sum"
  - Input: Response counts (count_1, count_2, count_3)
  - Formula: weightedSum = (count_1 × 0) + (count_2 × 1) + (count_3 × 2)
  - Weighting System:
    - Option 1 (Needs Improvement) = 0 points
    - Option 2 (Satisfactory) = 1 point
    - Option 3 (Excellent) = 2 points
  - Output arrows to: "Calculate Question Score"

- **Block 4**: "Calculate Max Possible Score"
  - Input: Total responses count
  - Formula: maxPossible = totalResponses × 2
  - Description: Maximum achievable score if all responses were Option 3
  - Output arrows to: "Calculate Question Score"

- **Block 5**: "Calculate Question Score"
  - Input: Weighted sum, Max possible score
  - Formula: questionScore = (weightedSum / maxPossible) × 100
  - Output: Question Score (0-100 percentage)
  - Output arrows to: "Section Score Calculation"

### Level 3: Section Processing Layer
- **Block 6**: "Group Questions by Section"
  - Input: All question scores
  - Process: Organize questions by their section type
  - Sections: Teaching Methodology, Communication Skills, Assessment Methods, etc.
  - Output arrows to: "Calculate Section Score"

- **Block 7**: "Calculate Section Score"
  - Input: All question scores within a section
  - Formula: sectionScore = Average of all question scores in section
  - Process: Sum all question scores, divide by question count
  - Output: Section Score (0-100 percentage)
  - Output arrows to: "Section Filtering"

- **Block 8**: "Section Filtering"
  - Input: All section scores
  - Process: Exclude certain sections from overall calculation
  - Excluded Sections:
    - "COURSE CONTENT AND STRUCTURE"
    - "STUDENT-CENTRIC FACTORS"
  - Output: Filtered section scores (only included sections)
  - Output arrows to: "Calculate Overall Score"

### Level 4: Overall Score Layer
- **Block 9**: "Calculate Overall Score"
  - Input: Filtered section scores
  - Formula: overallScore = Average of all included section scores
  - Process: Sum all section scores, divide by section count, round to nearest integer
  - Output: Overall Score (0-100 percentage)
  - Output arrows to: "Final Score Output"

### Level 5: Output Layer
- **Block 10**: "Final Score Output"
  - Input: Overall Score
  - Output: Final percentage score (0-100)
  - Used for: Faculty performance evaluation, reports, visualizations

## Visual Style:
- Use rectangular blocks for processes
- Use arrows to show data flow (top to bottom)
- Color coding:
  - Blue: Input/Output blocks
  - Green: Calculation blocks
  - Yellow: Filtering/Processing blocks
  - Orange: Final output
- Include formula annotations next to calculation blocks
- Show example values where helpful (e.g., "Example: 50 responses → weightedSum = 80 → questionScore = 80%")

## Additional Details:
- Show parallel processing: Multiple questions processed simultaneously
- Indicate that the flow repeats for each faculty member
- Include a note about the 0-1-2 weighting system being consistent across all calculations
- Show that section scores are calculated independently before being averaged for overall score

## Example Flow:
1. 100 student responses: 20×Option1, 30×Option2, 50×Option3
2. Weighted Sum = (20×0) + (30×1) + (50×2) = 130
3. Max Possible = 100 × 2 = 200
4. Question Score = (130/200) × 100 = 65%
5. Section Score = Average of all question scores in section
6. Overall Score = Average of all included section scores
















