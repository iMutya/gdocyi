export const templates = [
    {
        id: "blank", 
        label: "Blank Document", 
        imageUrl: "/blank-document.svg",
        initialContent: "",
    },
    {
        id: "software-proposal", 
        label: "Software Development Proposal", 
        imageUrl: "/software-proposal.svg",
        initialContent: `
            <h1>Software Development Proposal</h1>
            <h2>Executive Summary</h2>
            <p>
            This proposal outlines the plan to design, develop, and deliver a software
            solution that meets defined business and user requirements.
            </p>

            <h2>Project Overview</h2>
            <p>
            The project aims to build a reliable, scalable, and user-friendly software
            application using modern development technologies and best practices.
            </p>

            <h2>Objectives</h2>
            <p>
            The main objectives are to improve efficiency, enhance user experience,
            and ensure system security and maintainability.
            </p>

            <h2>Scope of Work</h2>
            <p>
            The scope includes requirements analysis, system design, development,
            testing, deployment, and initial support.
            </p>

            <h2>Timeline</h2>
            <p>
            The project will be completed in phases including planning, design,
            development, testing, and deployment.
            </p>

            <h2>Deliverables</h2>
            <p>
            Final deliverables include a functional software application, source code,
            and supporting documentation.
            </p>

            <h2>Assumptions</h2>
            <p>
            Timely feedback, resource availability, and approved requirements are
            assumed throughout the project duration.
            </p>

            <h2>Conclusion</h2>
            <p>
            This proposal provides a structured approach to delivering a high-quality
            software solution that delivers long-term value.
            </p>
        `
    },
    {
        id: "project-proposal", 
        label: "Project Proposal", 
        imageUrl: "/project-proposal.svg",
        initialContent: `
            <h2>Executive Summary</h2>
            <p>
            This project proposal presents an overview of the planned project, including
            its purpose, objectives, and expected outcomes.
            </p>

            <h2>Project Background</h2>
            <p>
            The project is initiated to address an identified need or problem and provide
            an effective solution that adds value to the organization or stakeholders.
            </p>

            <h2>Project Objectives</h2>
            <p>
            The primary objectives of this project are to achieve defined goals within the
            given timeline, budget, and resource constraints.
            </p>

            <h2>Project Scope</h2>
            <p>
            The scope of the project defines the key activities, deliverables, and
            boundaries to ensure clear expectations and controlled execution.
            </p>

            <h2>Methodology</h2>
            <p>
            The project will follow a structured methodology involving planning,
            execution, monitoring, and completion phases.
            </p>
        `
    },
    {
        id: "business-letter", 
        label: "Business Letter", 
        imageUrl: "/business-letter.svg" ,
        initialContent: `
            <h1>Business Letter</h1>

            <p>
            <strong>Date:</strong> [Insert Date]
            </p>

            <p>
            <strong>Recipient Name</strong><br>
            Recipient Position<br>
            Company Name<br>
            Company Address
            </p>

            <p>
            Dear [Recipient Name],
            </p>

            <p>
            This letter is written to formally communicate regarding [state the purpose
            of the letter clearly and concisely]. The intent of this correspondence is to
            provide relevant information and maintain professional communication.
            </p>

            <p>
            We appreciate the opportunity to discuss this matter and look forward to your
            response. Please feel free to contact us should you require any additional
            information or clarification.
            </p>

            <p>
            Thank you for your time and consideration.
            </p>

            <p>
            Sincerely,<br>
            [Your Full Name]<br>
            [Your Position]<br>
            [Company Name]<br>
            [Contact Information]
            </p>   
        `
    },
    {
        id: "resume", 
        label: "Resume", 
        imageUrl: "/resume.svg",
        initialContent:`
            <h1>Resume</h1>

            <h2>Personal Information</h2>
            <p>
            <strong>Full Name</strong><br>
            Address<br>
            Phone Number | Email Address<br>
            LinkedIn / Portfolio (optional)
            </p>

            <h2>Professional Summary</h2>
            <p>
            A brief summary highlighting your skills, experience, and career goals.
            </p>

            <h2>Skills</h2>
            <ul>
                <li>Technical Skill 1</li>
                <li>Technical Skill 2</li>
                <li>Soft Skill 1</li>
                <li>Soft Skill 2</li>
            </ul>

            <h2>Work Experience</h2>
            <p>
            <strong>Job Title</strong> – Company Name<br>
            <em>Start Date – End Date</em>
            </p>
            <ul>
                <li>Key responsibility or achievement</li>
                <li>Key responsibility or achievement</li>
            </ul>

            <h2>Education</h2>
            <p>
            <strong>Degree / Program</strong><br>
            School / University Name<br>
            Year Graduated
            </p>

            <h2>Projects</h2>
            <p>
            <strong>Project Title</strong><br>
            Brief description of the project and technologies used.
            </p>

            <h2>Certifications</h2>
            <ul>
                <li>Certification Name</li>
                <li>Certification Name</li>
            </ul>

            <h2>References</h2>
            <p>
            Available upon request.
            </p>
        `
    },
    {
        id: "cover-letter", 
        label: "Cover Letter", 
        imageUrl: "/cover-letter.svg",
        initialContent: `
            <h1>Cover Letter</h1>
    
            <p>
            <strong>Date:</strong> [Insert Date]
            </p>
    
            <p>
            <strong>Hiring Manager Name</strong><br>
            Company Name<br>
            Company Address
            </p>
    
            <p>
            Dear [Hiring Manager Name],
            </p>
    
            <p>
            I am writing to express my interest in the [Job Title] position at
            [Company Name]. With my skills, educational background, and enthusiasm for
            learning, I am confident in my ability to contribute positively to your team.
            </p>
    
            <p>
            Throughout my academic and project experience, I have developed relevant
            skills in [mention key skills or tools]. These experiences have strengthened
            my ability to work collaboratively, manage tasks efficiently, and adapt to
            new challenges.
            </p>
    
            <p>
            I am eager to apply my knowledge in a professional environment and further
            develop my skills while contributing to the goals of your organization. I
            would welcome the opportunity to discuss how I can be a valuable addition
            to your team.
            </p>
    
            <p>
            Thank you for considering my application. I look forward to the opportunity
            to speak with you.
            </p>
    
            <p>
            Sincerely,<br>
            [Your Full Name]<br>
            [Phone Number]<br>
            [Email Address]
            </p>
        `
    },
    {
        id: "letter", 
        label: "Letter", 
        imageUrl: "/letter.svg",
        initialContent: `
            <h1>Letter</h1>

            <p>
                <strong>Date:</strong> [Insert Date]
            </p>

            <p>
                [Recipient Name]<br>
                [Recipient Address]
            </p>

            <p>
                Dear [Recipient Name],
            </p>

            <p>
                I hope this letter finds you well. I am writing to [state the purpose of your letter clearly and concisely].
            </p>

            <p>
                [Add additional details, explanations, or context here. Keep paragraphs short and clear.]
            </p>

            <p>
                I appreciate your time and attention to this matter and look forward to your response.
            </p>

            <p>
                Sincerely,<br>
                [Your Name]<br>
                [Your Contact Information]
            </p>

        `
    },
];
