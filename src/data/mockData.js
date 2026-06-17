// ============================================================
// CraniaVerse — sample data
// ============================================================

export const NAV = [
  { label: 'Admin', items: ['Dashboard', 'Calendar', 'To Do', 'Schedules'] },
  { label: 'Customers', items: ['Customers', 'Surveys'] },
  { label: 'Students', items: ['Students'] },
  { label: 'Programs', items: ['Programs'] },
  { label: 'Contests', items: ['Contests'] },
  { label: 'Staff', items: ['Staff Information', 'Staff Information Form', 'Staff Hub'] },
  { label: 'Operations', items: ['Crania Cash', 'Inventory'] },
  { label: 'Financial', items: ['Accounting', 'Fee Schedules', 'Payroll', 'Payments', 'Invoices', 'Receipts'] },
  { label: 'Marketing', items: ['Marketing'] },
]

export const revenueByProgram = [
  { name: 'Flex Math', target: 8200, actual: 13450 },
  { name: 'Teknokids Coding', target: 4200, actual: 6100 },
  { name: 'Summer Camp', target: 4800, actual: 9200 },
  { name: 'Gauss Contest', target: 3100, actual: 2400 },
]

export const trendData = [
  { month: 'Aug 26', Registrations: 50, Cancellations: 3 },
  { month: 'Sep 26', Registrations: 22, Cancellations: 4 },
  { month: 'Oct 26', Registrations: 13, Cancellations: 6 },
  { month: 'Nov 26', Registrations: 9, Cancellations: 7 },
  { month: 'Dec 26', Registrations: 8, Cancellations: 5 },
  { month: 'Jan 27', Registrations: 6, Cancellations: 9 },
  { month: 'Feb 27', Registrations: 14, Cancellations: 6 },
  { month: 'Mar 27', Registrations: 9, Cancellations: 8 },
  { month: 'Apr 27', Registrations: 7, Cancellations: 11 },
  { month: 'May 27', Registrations: 5, Cancellations: 12 },
  { month: 'Jun 27', Registrations: 3, Cancellations: 10 },
  { month: 'Jul 27', Registrations: 6, Cancellations: 9 },
]

export const dashboardCards = {
  tasks: [{ label: 'May Payroll', done: true }],
  calendar: [{ label: '4:00 pm — Yahia G6 Assessment', done: true }],
  attendance: [
    { name: 'Maya', time: '2:30 pm', cls: 'Coding Contest Club', ok: true },
    { name: 'John B', time: '3:30 pm', cls: 'Math Contest Club', ok: false },
  ],
}

export const todos = [
  { id: 1, category: 'Students', priority: 1, task: 'Follow up on Hobo K. assessment results', due: 'Jun 5', done: false },
  { id: 2, category: 'Students', priority: 3, task: 'Update grade promotions for summer cohort', due: 'Jun 18', done: false },
  { id: 3, category: 'Customers', priority: 2, task: 'Call the Karim family re: fee installment', due: 'Jun 7', done: true },
  { id: 4, category: 'Customers', priority: 1, task: 'Resolve duplicate guardian record', due: 'Jun 4', done: false },
  { id: 5, category: 'Customers', priority: 1, task: 'Send welcome packet to 3 new families', due: 'Jun 6', done: false },
  { id: 6, category: 'Staff', priority: 2, task: 'Confirm May payroll hours', due: 'Jun 2', done: false },
  { id: 7, category: 'Marketing', priority: 3, task: 'Schedule summer camp social posts', due: 'Jun 20', done: false },
  { id: 8, category: 'Marketing', priority: 1, task: 'Approve Gauss Contest flyer', due: 'Jun 3', done: false },
  { id: 9, category: 'Technology', priority: 2, task: 'Reset 2 tablet logins in Boardwalk room', due: 'Jun 9', done: false },
  { id: 10, category: 'Curriculum', priority: 4, task: 'Review Flex Math unit 7 materials', due: 'Jun 25', done: false },
  { id: 11, category: 'Finance', priority: 1, task: 'Reconcile April invoices', due: 'Jun 3', done: false },
  { id: 12, category: 'Operations', priority: 1, task: 'Order whiteboard markers + printer toner', due: 'Jun 4', done: false },
  { id: 13, category: 'Other', priority: 2, task: 'Plan staff appreciation lunch', due: 'Jun 14', done: false },
]

export const programs = [
  { category: 'Math', subject: 'Mathematics', code: 'FM-101', title: 'Flex Math — Grades 3-4', schedule: 'Mon/Wed 4:00pm', fees: '$299/mo', active: true },
  { category: 'Coding', subject: 'Computer Science', code: 'TK-201', title: 'Teknokids Coding: HTML/CSS', schedule: 'Tue 5:00pm', fees: '$279/mo', active: true },
  { category: 'Coding', subject: 'Computer Science', code: 'TK-202', title: 'Teknokids Coding: JavaScript', schedule: 'Thu 5:00pm', fees: '$279/mo', active: true },
  { category: 'Camp', subject: 'Enrichment', code: 'SC-300', title: 'Summer Camp — Full Day', schedule: 'Jul Mon-Fri', fees: '$1,450/wk', active: true },
  { category: 'Contest', subject: 'Mathematics', code: 'GC-410', title: 'Gauss Contest Club', schedule: 'Sat 10:00am', fees: '$149/mo', active: false },
  { category: 'Music', subject: 'Piano', code: 'PN-120', title: 'Private Piano — 30 min', schedule: 'By appointment', fees: '$45/lesson', active: true },
]

export const student = {
  firstName: 'Hobo',
  lastName: 'Karim',
  gender: 'Female',
  dob: 'Dec 1, 2013',
  age: '12.25',
  email: 'student@school.ca',
  grade: '7',
  school: 'Cranius',
  medical: 'Overly cute',
  notes: [
    'Excellent student',
    'Sometimes a little chatty',
    'Eager to learn',
    'Very smart',
    'Generally works well on her own',
    'Ensure she doesn\u2019t fall asleep!',
    'DOES NOT TAKE HOMEWORK!',
  ],
  assessments: [
    { name: 'MATH — YELLOW', date: 'Aug 1, 2026', score: '55%' },
    { name: 'ENGLISH — BLUE', date: 'Jul 3, 2026', score: '32%' },
  ],
  login: { username: '\u2014 generate \u2014', password: '\u2014 generate \u2014' },
  craniaCash: 45,
}

export const customer = {
  student: {
    'First Name': 'Hobo', 'Last Name': 'Karim', Gender: 'Female', DOB: 'Dec 1, 2013',
    'Current Age': '12.25', Email: 'student@school.ca', 'Current Grade': '7',
    School: 'Cranius', 'Report Card': 'link', 'Medical Conditions': 'Overly cute',
  },
  guardian1: {
    'First Name': 'Father', 'Last Name': 'Karim', Relationship: 'Dadders',
    'Phone (Home)': '(123) 456-7890', 'Phone (Mobile)': '(123) 456-7890',
    Email: 'father@kuber.com', 'Street Address': '7 Fun Lane', Unit: '',
    City: 'Waterloo', Province: 'Ontario', 'Postal Code': 'A1B 2C3', 'Occupation': 'Cool guy',
  },
  guardian2: {
    'First Name': 'Mother', 'Last Name': 'Karim', Relationship: 'Mummers',
    'Phone (Home)': '(123) 456-7890', 'Phone (Mobile)': '(123) 456-7890',
    Email: 'mother@kuber.com', 'Street Address': '7 Fun Lane', Unit: '',
    City: 'Waterloo', Province: 'Ontario', 'Postal Code': 'A1B 2C3', 'Occupation': '',
  },
  emergency: {
    'First Name': 'Chicken', 'Last Name': 'Licken', Relationship: 'Neighbour',
    'Phone (Mobile)': '(123) 456-7890', Email: 'chickens@next.ca',
  },
}

export const studentPrograms = [
  { year: '2022_23', program: 'FLEX MATH - YELLOW' },
  { year: '2022_23', program: 'SUMMER CAMP WEEK 1' },
  { year: '2025_26', program: 'MATH ENRICHMENT LEVEL 4' },
  { year: '2025_26', program: 'MATH CONTEST CLUB' },
  { year: '2025_26', program: 'CROCHET CLUB' },
]

export const lessonComments = {
  '2022_23|FLEX MATH - YELLOW': [
    {
      lessonNo: 1, day: 'Mon', date: '......', attendance: 'P', uniform: 'Y',
      lessonPlan: '1. Handwriting – Teach Aa; worksheet\n2. Reading – L1 Sight Words\n3. Spelling – A1 practice',
      homeworkCompleted: '',
      performance: '1. Handwriting - struggled with remembering a\n2. Reading - mastered after practice\n3. Spelling – only \'hop\' incorrect',
      behaviour: '- Very well behaved\n- Listed to all instructions\n- Very engaged',
      homeworkAssigned: '- N/A',
      parentComm: '- Told mum she did great!',
      teacher: '- Ms. Tas',
    },
    { lessonNo: 2, day: 'Tue', date: '......', attendance: 'L', uniform: 'Borrowed', lessonPlan: '', homeworkCompleted: '', performance: '', behaviour: '', homeworkAssigned: '', parentComm: '', teacher: '' },
    { lessonNo: 3, day: 'Wed', date: '......', attendance: 'E', uniform: 'Y', lessonPlan: '', homeworkCompleted: '', performance: '', behaviour: '', homeworkAssigned: '', parentComm: '', teacher: '' },
    { lessonNo: 4, day: 'Thu', date: '......', attendance: 'A', uniform: 'Y', lessonPlan: '', homeworkCompleted: '', performance: '', behaviour: '', homeworkAssigned: '', parentComm: '', teacher: '' },
    { lessonNo: 5, day: 'Sat', date: '......', attendance: '', uniform: '', lessonPlan: '', homeworkCompleted: '', performance: '', behaviour: '', homeworkAssigned: '', parentComm: '', teacher: '' },
    { lessonNo: 6, day: '', date: '', attendance: '', uniform: '', lessonPlan: '', homeworkCompleted: '', performance: '', behaviour: '', homeworkAssigned: '', parentComm: '', teacher: '' },
    { lessonNo: 7, day: '', date: '', attendance: '', uniform: '', lessonPlan: '', homeworkCompleted: '', performance: '', behaviour: '', homeworkAssigned: '', parentComm: '', teacher: '' },
  ],
}

export const feeSchedule = {
  registrationFee: 79,
  materialFee: 59,
  monthly: 299,
  totalWeeks: 35,
  months: [
    'September 2025', 'October 2025', 'November 2025', 'December 2025',
    'January 2026', 'February 2026', 'March 2026', 'April 2026',
    'May 2026', 'June 2026',
  ],
}

// Teaching schedule — two locations
const evt = (label, color) => ({ label, color })
const C = {
  red: '#e8503f', orange: '#e8814a', green: '#4caf50', dark: '#3a3a3a',
  purple: '#b07cc6', amber: '#f0a93a', teal: '#3aa0a0', salmon: '#e98b7a',
}
export const scheduleData = {
  locations: ['Boardwalk', 'Waterloo East'],
  Boardwalk: [
    [evt('ADMIN', C.red), evt('FLEX MATH 55MIN', C.amber), evt('FLEX MATH 55MIN', C.amber), evt('FLEX MATH 55MIN', C.amber), evt('PIANO PRIVATE 30MIN', C.amber)],
    [evt('BREAK', C.red), evt('FLEX MATH 55MIN', C.amber)],
    [evt('FLEX KINDERGARTEN 55MIN', C.amber), evt('FLEX MATH 55MIN', C.amber), evt('MATH ENRICHMENT G5-6', C.red), evt('MATH ENRICHMENT G7-8', C.red), evt('PRIVATE LESSONS 55MIN', C.dark)],
    [evt('FLEX MATH 55MIN', C.amber), evt('MATH ENRICHMENT G3-4', C.red), evt('MEETING', C.dark), evt('MEETING', C.dark)],
    [evt('PIANO PRIVATE 30MIN', C.amber), evt('TEKNOKIDS CODING: HTML/CSS', C.green), evt('TEKNOKIDS CODING: JAVASCRIPT', C.green)],
    [],
    [evt('FLEX MATH 55MIN', C.red), evt('TEKNOKIDS EARLY', C.green), evt('TEKNOKIDS JUNIOR', C.green)],
  ],
  'Waterloo East': [
    [evt('ADMIN', C.salmon), evt('FLEX MATH 55MIN', C.salmon), evt('MEETING', C.dark), evt('PRIVATE LESSONS 55MIN', C.dark)],
    [evt('ADMIN', C.salmon), evt('FLEX MATH 55MIN', C.salmon), evt('MEETING', C.dark)],
    [evt('MATH ENRICHMENT G5-6', C.red), evt('MATH ENRICHMENT G3-4', C.red), evt('PRIVATE LESSONS 55MIN', C.dark)],
    [evt('MATH ENRICHMENT G7-8', C.red), evt('MEETING', C.dark)],
    [evt('FLEX MATH 55MIN', C.salmon), evt('MEETING', C.dark)],
    [],
    [evt('ADMIN', C.salmon), evt('CODING CONTEST CLUB', C.amber), evt('MATH CONTEST CLUB', C.amber), evt('PRIVATE LESSONS 55MIN', C.dark)],
  ],
}
